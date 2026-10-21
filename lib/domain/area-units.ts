// Client-safe area unit identifiers (conversion math lives in units.ts).

/** Area units commonly found in Salvadoran listings. */
export const AREA_UNITS = ["M2", "V2", "MZ"] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

export const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  M2: "Square meters (m²)",
  V2: "Varas cuadradas (v²)",
  MZ: "Manzanas (mz)",
};
