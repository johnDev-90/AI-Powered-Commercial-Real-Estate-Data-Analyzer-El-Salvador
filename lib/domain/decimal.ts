import { Decimal } from "@prisma/client/runtime/client";
import type { AreaBasis, PropertyType } from "@/lib/generated/prisma/enums";

export { Decimal };

export type DecimalLike = Decimal | string | number;

export function toDecimal(value: DecimalLike | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const d = value instanceof Decimal ? value : new Decimal(value);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

/** Monetary/area rounding used everywhere: 2 decimal places, half-up. */
export function round2(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Which area an asking price per m² is computed against for each property type. */
export function priceBasisFor(type: PropertyType | null | undefined): AreaBasis | null {
  if (!type) return null;
  return type === "COMMERCIAL_LAND" ? "LAND" : "BUILDING";
}

export interface PricePerM2Input {
  askingPriceUsd: DecimalLike | null | undefined;
  landAreaM2: DecimalLike | null | undefined;
  buildingAreaM2: DecimalLike | null | undefined;
  propertyType: PropertyType | null | undefined;
}

/**
 * Asking price per m². Returns null when the data does not support the calculation
 * (no type, missing/zero/negative price or basis area). No fallback to a different
 * basis: mixing land and building rates would make comparisons misleading.
 */
export function computePricePerM2(input: PricePerM2Input): { value: Decimal; basis: AreaBasis } | null {
  const basis = priceBasisFor(input.propertyType);
  if (!basis) return null;
  const price = toDecimal(input.askingPriceUsd);
  const area = toDecimal(basis === "LAND" ? input.landAreaM2 : input.buildingAreaM2);
  if (!price || !area || price.lte(0) || area.lte(0)) return null;
  return { value: round2(price.div(area)), basis };
}

/** Relative difference |a-b| / max(|a|,|b|). Returns 0 when both are zero. */
export function relativeDifference(a: Decimal, b: Decimal): Decimal {
  const denom = Decimal.max(a.abs(), b.abs());
  if (denom.isZero()) return new Decimal(0);
  return a.minus(b).abs().div(denom);
}

/** Serialize for the server→client boundary (Decimal is not serializable). */
export function decimalToString(value: Decimal | null | undefined): string | null {
  return value ? value.toFixed(2) : null;
}
