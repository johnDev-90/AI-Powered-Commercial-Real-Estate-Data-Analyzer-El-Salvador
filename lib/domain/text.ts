/** Lowercase, strip accents/diacritics, collapse whitespace. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ADDRESS_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\b(av|ave|avda)\b\.?/g, "avenida"],
  [/\b(blvd|blvr|bulevar|bulevard|boulevar)\b\.?/g, "boulevard"],
  [/\b(col)\b\.?/g, "colonia"],
  [/\b(c|cl)\b\.(?=\s)/g, "calle"],
  [/\b(urb)\b\.?/g, "urbanizacion"],
  [/\b(res)\b\.?/g, "residencial"],
  [/\b(carr|ctra)\b\.?/g, "carretera"],
  [/\b(km|kilometro)\b\.?/g, "km"],
  [/\b(no|num|nro)\b\.?(?=\s*\d)/g, "#"],
  [/\b(pje|psje)\b\.?/g, "pasaje"],
  [/\b(edif|ed)\b\.?/g, "edificio"],
  [/\bstreet\b/g, "calle"],
  [/\bavenue\b/g, "avenida"],
];

/**
 * Canonical address used only for matching potential duplicates.
 * The original address is always kept unchanged.
 */
export function normalizeAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  let value = normalizeText(address);
  for (const [pattern, replacement] of ADDRESS_ABBREVIATIONS) value = value.replace(pattern, replacement);
  value = value
    .replace(/[#]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\bel salvador$/, "")
    .trim();
  return value.length > 0 ? value : null;
}

/** Trim and collapse whitespace; empty strings become null. */
export function cleanString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}
