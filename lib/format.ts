// Client-safe display formatting. Inputs are decimal strings from the server.

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/El_Salvador" });

const toNumber = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

export function formatUsd(value: string | number | null | undefined, opts: { cents?: boolean; compact?: boolean } = {}): string {
  const n = toNumber(value);
  if (n === null || Number.isNaN(n)) return "—";
  if (opts.compact) return compactUsd.format(n);
  return (opts.cents ? usdCents : usdFormatter).format(n);
}

export function formatUsdPerM2(value: string | number | null | undefined): string {
  const n = toNumber(value);
  return n === null || Number.isNaN(n) ? "—" : `${usdCents.format(n)}/m²`;
}

export function formatArea(value: string | number | null | undefined): string {
  const n = toNumber(value);
  return n === null || Number.isNaN(n) ? "—" : `${numberFormatter.format(n)} m²`;
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : numberFormatter.format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function percent(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}
