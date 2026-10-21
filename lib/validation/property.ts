import { z } from "zod";
import { PROPERTY_TYPES, VERIFICATION_STATUSES } from "@/lib/domain/labels";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

/** Decimal string with up to 2 decimals; empty → null. Kept as string to avoid float errors. */
const optionalDecimal = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[,\s$]/g, ""))
    .refine((v) => v === "" || /^\d{1,13}(\.\d{1,2})?$/.test(v), `${label} must be a non-negative number with up to 2 decimals.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const propertyFormSchema = z.object({
  referenceCode: optionalText(60).transform((v) => v?.toUpperCase() ?? null),
  name: z.string().trim().min(1, "Property name is required.").max(200),
  address: z.string().trim().min(1, "Address is required.").max(300),
  municipality: z.string().trim().min(1, "Municipality is required.").max(100),
  department: z.string().trim().min(1, "Department is required.").max(100),
  propertyType: z.enum(PROPERTY_TYPES, { message: "Select a property type." }),
  cadastralId: optionalText(80).transform((v) => v?.toUpperCase() ?? null),
  landAreaM2: optionalDecimal("Land area"),
  buildingAreaM2: optionalDecimal("Building area"),
  askingPriceUsd: optionalDecimal("Asking price"),
  description: optionalText(4000),
  zoning: optionalText(200),
  verificationStatus: z
    .union([z.enum(VERIFICATION_STATUSES), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  sourceUpdatedAt: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use the format YYYY-MM-DD.")
    .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null)),
});

export type PropertyFormInput = z.input<typeof propertyFormSchema>;
export type PropertyFormValues = z.output<typeof propertyFormSchema>;

/** List/search filters from URL search params. Unknown values fall back to defaults. */
export const propertyListQuerySchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  municipality: z.string().trim().max(100).optional().catch(undefined),
  department: z.string().trim().max(100).optional().catch(undefined),
  type: z.enum(PROPERTY_TYPES).optional().catch(undefined),
  verification: z.enum([...VERIFICATION_STATUSES, "MISSING"]).optional().catch(undefined),
  issues: z.enum(["open", "none"]).optional().catch(undefined),
  sort: z
    .enum(["updated", "name", "price", "priceDesc", "pricePerM2", "pricePerM2Desc", "area", "issues"])
    .default("updated")
    .catch("updated"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25).catch(25),
});

export type PropertyListQuery = z.infer<typeof propertyListQuerySchema>;

export function searchParamsToObject(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value !== "") out[k] = value;
  }
  return out;
}
