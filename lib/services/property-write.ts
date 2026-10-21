import type { AreaBasis, PropertyType } from "@/lib/generated/prisma/enums";
import { computePricePerM2, toDecimal, type Decimal, type DecimalLike } from "@/lib/domain/decimal";
import { normalizeAddress } from "@/lib/domain/text";

export interface DerivedFields {
  normalizedAddress: string | null;
  pricePerM2Usd: Decimal | null;
  pricePerM2Basis: AreaBasis | null;
}

/** The single place where derived property fields are computed for every write. */
export function deriveFields(input: {
  address: string | null;
  propertyType: PropertyType | null;
  askingPriceUsd: DecimalLike | null;
  landAreaM2: DecimalLike | null;
  buildingAreaM2: DecimalLike | null;
}): DerivedFields {
  const ppm = computePricePerM2({
    askingPriceUsd: toDecimal(input.askingPriceUsd),
    landAreaM2: toDecimal(input.landAreaM2),
    buildingAreaM2: toDecimal(input.buildingAreaM2),
    propertyType: input.propertyType,
  });
  return {
    normalizedAddress: normalizeAddress(input.address),
    pricePerM2Usd: ppm?.value ?? null,
    pricePerM2Basis: ppm?.basis ?? null,
  };
}
