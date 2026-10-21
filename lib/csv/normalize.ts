import type { PropertyType, VerificationStatus } from "@/lib/generated/prisma/enums";
import { Decimal, round2 } from "@/lib/domain/decimal";
import { canonicalDepartment, canonicalMunicipality } from "@/lib/domain/geography";
import { cleanString, normalizeText } from "@/lib/domain/text";
import { pricePerUnitToPerM2, toSquareMeters } from "@/lib/domain/units";
import type { ColumnMapping, ImportOptions, TargetField } from "./mapping";

/** Property values after normalization, before derived fields are computed. */
export interface NormalizedProperty {
  referenceCode: string | null;
  name: string | null;
  address: string | null;
  municipality: string | null;
  department: string | null;
  propertyType: PropertyType | null;
  rawPropertyType: string | null;
  cadastralId: string | null;
  landAreaM2: Decimal | null;
  buildingAreaM2: Decimal | null;
  askingPriceUsd: Decimal | null;
  sourcePricePerM2: Decimal | null;
  description: string | null;
  zoning: string | null;
  verificationStatus: VerificationStatus | null;
  sourceUpdatedAt: Date | null;
}

/** A value that was present in the source but could not be interpreted. */
export interface RowMessage {
  code: "UNPARSEABLE_VALUE" | "UNRECOGNIZED_VALUE" | "STRUCTURE" | "UNIDENTIFIABLE";
  field?: TargetField;
  rawValue?: string;
  message: string;
}

export interface NormalizedRow {
  property: NormalizedProperty;
  messages: RowMessage[];
  /** Reasons the row must be rejected (cannot be identified or is structurally broken). */
  rejectionReasons: string[];
}

const EMPTY_TOKENS = new Set(["", "-", "--", "n/a", "na", "null", "none", "sin dato", "s/d", "nd", "n.d."]);

function isEmptyToken(value: string): boolean {
  return EMPTY_TOKENS.has(normalizeText(value));
}

export type ParsedNumber = { kind: "empty" } | { kind: "invalid"; raw: string } | { kind: "ok"; value: Decimal };

/**
 * Parse a number written with currency symbols, units and thousands separators.
 * `decimalSeparator` must be explicit because "1.250" is ambiguous.
 */
export function parseNumber(raw: string | undefined, decimalSeparator: "." | ","): ParsedNumber {
  if (raw === undefined || isEmptyToken(raw)) return { kind: "empty" };
  let value = raw
    .replace(/us\$|usd|\$|dólares|dolares/gi, "")
    .replace(/m²|m2|mts2?|metros( cuadrados)?|v²|v2|varas( cuadradas)?|mz|manzanas?/gi, "")
    .replace(/\s+/g, "");
  if (decimalSeparator === ",") value = value.replace(/\./g, "").replace(",", ".");
  else value = value.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(value)) return { kind: "invalid", raw };
  return { kind: "ok", value: new Decimal(value) };
}

/** Parse ISO (YYYY-MM-DD) or slash/dash dates (DD/MM/YYYY by default, as used in El Salvador). */
export function parseDate(raw: string | undefined, format: "DMY" | "MDY"): Date | "invalid" | null {
  if (raw === undefined || isEmptyToken(raw)) return null;
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(value);
  let y: number, m: number, d: number;
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const parts = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
    if (!parts) return "invalid";
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    y = Number(parts[3]);
    [d, m] = format === "DMY" ? [a, b] : [b, a];
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "invalid";
  return date;
}

const TYPE_SYNONYMS: Array<[PropertyType, string[]]> = [
  ["COMMERCIAL_LAND", ["commercial land", "land", "terreno", "terreno comercial", "lote", "lote comercial", "solar", "commercial_land"]],
  ["RETAIL", ["retail", "retail space", "local", "local comercial", "tienda", "locales comerciales", "retail store"]],
  ["OFFICE", ["office", "office building", "oficina", "oficinas", "edificio de oficinas", "edificio oficinas", "office space"]],
  ["WAREHOUSE_INDUSTRIAL", ["warehouse", "industrial", "warehouse industrial", "warehouse / industrial", "bodega", "nave industrial", "galera", "ofibodega", "warehouse_industrial"]],
  ["SHOPPING_CENTER", ["shopping center", "shopping centre", "centro comercial", "plaza comercial", "mall", "strip mall", "shopping_center"]],
];

export function parsePropertyType(raw: string | null): PropertyType | null {
  if (!raw) return null;
  const key = normalizeText(raw).replace(/[_]/g, " ");
  for (const [type, synonyms] of TYPE_SYNONYMS) {
    if (synonyms.includes(key) || key === type.toLowerCase().replace(/_/g, " ")) return type;
  }
  return null;
}

const VERIFICATION_SYNONYMS: Array<[VerificationStatus, string[]]> = [
  ["VERIFIED", ["verified", "verificado", "verificada", "documented", "documentado"]],
  ["PARTIALLY_VERIFIED", ["partially verified", "partial", "parcial", "parcialmente verificado", "partially_verified"]],
  ["PENDING_REVIEW", ["pending", "pending review", "pendiente", "en revision", "pending_review", "in review"]],
  ["UNVERIFIED", ["unverified", "not verified", "no verificado", "sin verificar", "sin documentos"]],
];

export function parseVerificationStatus(raw: string | null): VerificationStatus | null {
  if (!raw) return null;
  const key = normalizeText(raw).replace(/[_]/g, " ");
  for (const [status, synonyms] of VERIFICATION_SYNONYMS) {
    if (synonyms.includes(key)) return status;
  }
  return null;
}

/** Normalize one CSV row using the column mapping and import options. */
export function normalizeRow(
  values: Record<string, string>,
  mapping: ColumnMapping,
  options: ImportOptions,
  structuralErrors: string[] = [],
): NormalizedRow {
  const messages: RowMessage[] = [];
  const get = (field: TargetField): string | undefined => {
    const header = mapping[field];
    return header === undefined ? undefined : values[header];
  };
  const text = (field: TargetField): string | null => {
    const raw = get(field);
    return raw === undefined || isEmptyToken(raw) ? null : cleanString(raw);
  };
  const number = (field: TargetField): Decimal | null => {
    const parsed = parseNumber(get(field), options.decimalSeparator);
    if (parsed.kind === "invalid") {
      messages.push({ code: "UNPARSEABLE_VALUE", field, rawValue: parsed.raw, message: `Could not read "${parsed.raw}" as a number.` });
      return null;
    }
    return parsed.kind === "ok" ? parsed.value : null;
  };

  const rawType = text("propertyType");
  const propertyType = parsePropertyType(rawType);

  const rawVerification = text("verificationStatus");
  const verificationStatus = parseVerificationStatus(rawVerification);
  if (rawVerification && !verificationStatus) {
    messages.push({ code: "UNRECOGNIZED_VALUE", field: "verificationStatus", rawValue: rawVerification, message: `Unrecognized verification status "${rawVerification}".` });
  }

  const landRaw = number("landArea");
  const buildingRaw = number("buildingArea");
  const landAreaM2 = landRaw ? toSquareMeters(landRaw, options.landAreaUnit) : null;
  const buildingAreaM2 = buildingRaw ? toSquareMeters(buildingRaw, options.buildingAreaUnit) : null;

  // Stated price per area is converted to per m² using the unit of the basis area.
  const pricePerArea = number("pricePerArea");
  let sourcePricePerM2: Decimal | null = null;
  if (pricePerArea) {
    const unit = propertyType === "COMMERCIAL_LAND" ? options.landAreaUnit : options.buildingAreaUnit;
    sourcePricePerM2 = pricePerUnitToPerM2(pricePerArea, unit);
  }

  const lastUpdatedRaw = get("lastUpdated");
  const parsedDate = parseDate(lastUpdatedRaw, options.dateFormat);
  if (parsedDate === "invalid") {
    messages.push({ code: "UNPARSEABLE_VALUE", field: "lastUpdated", rawValue: lastUpdatedRaw, message: `Could not read "${lastUpdatedRaw}" as a date.` });
  }

  const municipalityRaw = text("municipality");
  const departmentRaw = text("department");

  const property: NormalizedProperty = {
    referenceCode: text("referenceCode")?.toUpperCase() ?? null,
    name: text("name"),
    address: text("address"),
    // Canonical spelling when the value is known; otherwise keep the source value for review.
    municipality: canonicalMunicipality(municipalityRaw) ?? municipalityRaw,
    department: canonicalDepartment(departmentRaw) ?? departmentRaw,
    propertyType,
    rawPropertyType: rawType,
    cadastralId: text("cadastralId")?.toUpperCase() ?? null,
    landAreaM2,
    buildingAreaM2,
    askingPriceUsd: (() => {
      const price = number("askingPrice");
      return price ? round2(price) : null;
    })(),
    sourcePricePerM2,
    description: text("description"),
    zoning: text("zoning"),
    verificationStatus,
    sourceUpdatedAt: parsedDate instanceof Date ? parsedDate : null,
  };

  const rejectionReasons = [...structuralErrors];
  if (!property.name && !property.address && !property.referenceCode && !property.cadastralId) {
    rejectionReasons.push("The row has no property ID, name, address or cadastral ID, so it cannot be identified.");
  }

  return { property, messages, rejectionReasons };
}
