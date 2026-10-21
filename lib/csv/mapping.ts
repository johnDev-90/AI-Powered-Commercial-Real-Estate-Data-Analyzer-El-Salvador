import { z } from "zod";
import { normalizeText } from "@/lib/domain/text";
import { AREA_UNITS } from "@/lib/domain/area-units";

/** Fields a CSV column can be mapped to. */
export const TARGET_FIELDS = [
  { key: "referenceCode", label: "Property ID", required: false },
  { key: "name", label: "Property name", required: true },
  { key: "address", label: "Address", required: true },
  { key: "municipality", label: "Municipality", required: true },
  { key: "department", label: "Department", required: true },
  { key: "propertyType", label: "Property type", required: true },
  { key: "cadastralId", label: "Parcel / cadastral ID", required: false },
  { key: "landArea", label: "Land area", required: false },
  { key: "buildingArea", label: "Building area", required: false },
  { key: "askingPrice", label: "Asking price (USD)", required: true },
  { key: "pricePerArea", label: "Price per area (as stated)", required: false },
  { key: "description", label: "Description", required: false },
  { key: "zoning", label: "Zoning / land use", required: false },
  { key: "verificationStatus", label: "Verification status", required: false },
  { key: "lastUpdated", label: "Last updated", required: false },
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number]["key"];
export const TARGET_FIELD_KEYS = TARGET_FIELDS.map((f) => f.key) as [TargetField, ...TargetField[]];

/** Header synonyms (normalized: lowercase, no accents, separators → spaces). English and Spanish. */
const SYNONYMS: Record<TargetField, string[]> = {
  referenceCode: ["property id", "id", "reference", "ref", "reference code", "codigo", "id propiedad", "codigo propiedad", "listing id", "property code"],
  name: ["property name", "name", "nombre", "nombre propiedad", "titulo", "title"],
  address: ["address", "property address", "direccion", "ubicacion", "street address"],
  municipality: ["municipality", "municipio", "city", "ciudad", "distrito", "district"],
  department: ["department", "departamento", "state", "province"],
  propertyType: ["property type", "type", "tipo", "tipo propiedad", "tipo de propiedad", "category", "categoria"],
  cadastralId: ["cadastral id", "parcel id", "parcel", "cadastral", "catastro", "numero catastral", "matricula", "parcela", "clave catastral"],
  landArea: ["land area", "land area m2", "land area sqm", "lot area", "area terreno", "area de terreno", "terreno", "terreno m2", "terreno v2", "area terreno v2", "area terreno m2"],
  buildingArea: ["building area", "building area m2", "built area", "gross building area", "area construccion", "area de construccion", "construccion", "construccion m2", "area construida", "area construccion m2", "area construccion v2"],
  askingPrice: ["asking price", "asking price usd", "price", "price usd", "list price", "precio", "precio usd", "precio venta", "precio de venta", "precio solicitado", "valor"],
  pricePerArea: ["price per m2", "price per m2 usd", "price per sqm", "usd per m2", "price m2", "usd m2", "precio m2", "precio por m2", "precio por v2", "precio v2"],
  description: ["description", "descripcion", "notes", "notas", "comentarios", "details"],
  zoning: ["zoning", "zoning land use", "land use", "zonificacion", "uso de suelo", "uso suelo"],
  verificationStatus: ["verification status", "documentation status", "status", "verification", "estado verificacion", "estado documentacion", "estado de verificacion", "verificacion"],
  lastUpdated: ["last updated", "updated", "updated at", "last update", "fecha actualizacion", "actualizado", "ultima actualizacion", "fecha"],
};

function normalizeHeader(header: string): string {
  return normalizeText(header)
    .replace(/[²]/g, "2")
    .replace(/[_\-./()$#:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ColumnMapping = Partial<Record<TargetField, string>>;

/** Suggest a mapping from target fields to source headers. Exact synonym matches win. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  const normalized = headers.map((h) => ({ header: h, key: normalizeHeader(h) }));

  for (const field of TARGET_FIELD_KEYS) {
    const synonyms = SYNONYMS[field];
    const match = normalized.find((h) => !used.has(h.header) && synonyms.includes(h.key));
    if (match) {
      mapping[field] = match.header;
      used.add(match.header);
    }
  }
  return mapping;
}

/** Suggest area units from headers that mention v², manzanas, etc. */
export function suggestAreaUnit(header: string | undefined): (typeof AREA_UNITS)[number] {
  if (!header) return "M2";
  const key = normalizeHeader(header);
  if (/\bv2\b|varas?/.test(key)) return "V2";
  if (/\bmz\b|manzanas?/.test(key)) return "MZ";
  return "M2";
}

export const importOptionsSchema = z.object({
  decimalSeparator: z.enum([".", ","]).default("."),
  landAreaUnit: z.enum(AREA_UNITS).default("M2"),
  buildingAreaUnit: z.enum(AREA_UNITS).default("M2"),
  dateFormat: z.enum(["DMY", "MDY"]).default("DMY"),
  isSynthetic: z.boolean().default(false),
});

export type ImportOptions = z.infer<typeof importOptionsSchema>;

export const columnMappingSchema = z
  // partialRecord: with enum keys, z.record would require every target field.
  .partialRecord(z.enum(TARGET_FIELD_KEYS), z.string().min(1).max(200))
  .refine((m) => Object.keys(m).length > 0, "Map at least one column.");

export const commitImportSchema = z.object({
  mapping: columnMappingSchema,
  options: importOptionsSchema,
});

export type CommitImportInput = z.infer<typeof commitImportSchema>;
