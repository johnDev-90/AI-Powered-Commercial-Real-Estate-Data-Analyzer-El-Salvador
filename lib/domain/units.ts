import { Decimal, round2 } from "./decimal";
import type { AreaUnit } from "./area-units";

export { AREA_UNIT_LABELS, AREA_UNITS, type AreaUnit } from "./area-units";

/** 1 vara cuadrada (v²) = 0.698896 m²; 1 manzana = 10,000 v² = 6,988.96 m². */
export const AREA_UNIT_TO_M2: Record<AreaUnit, Decimal> = {
  M2: new Decimal(1),
  V2: new Decimal("0.698896"),
  MZ: new Decimal("6988.96"),
};

export function toSquareMeters(value: Decimal, unit: AreaUnit): Decimal {
  return round2(value.mul(AREA_UNIT_TO_M2[unit]));
}

/** Convert a price per `unit` into a price per m². */
export function pricePerUnitToPerM2(value: Decimal, unit: AreaUnit): Decimal {
  return round2(value.div(AREA_UNIT_TO_M2[unit]));
}
