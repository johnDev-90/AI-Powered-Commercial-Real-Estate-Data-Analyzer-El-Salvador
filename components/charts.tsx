"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface BarDatum {
  label: string;
  value: number;
  /** Optional secondary line shown in the tooltip. */
  note?: string;
  /** Highlighted bars (e.g. selected property) use the strong accent step. */
  highlight?: boolean;
}

type Format = "number" | "usd" | "usdPerM2";

const formatters: Record<Format, (v: number) => string> = {
  number: (v) => v.toLocaleString("en-US"),
  usd: (v) => v.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }),
  usdPerM2: (v) => `${v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}/m²`,
};

function ChartTooltip({ active, payload, format }: { active?: boolean; payload?: Array<{ payload: BarDatum }>; format: Format }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-xs shadow-sm">
      <div className="font-medium text-ink">{d.label}</div>
      <div className="tabular text-ink-2">{formatters[format](d.value)}</div>
      {d.note && <div className="text-ink-3">{d.note}</div>}
    </div>
  );
}

/**
 * Single-series horizontal bar chart (magnitude by category). One hue, no legend
 * (the card title names the series), thin bars, recessive grid, hover tooltip, and a
 * table view for screen readers and exact values.
 */
export function HorizontalBars({ data, format = "number", label }: { data: BarDatum[]; format?: Format; label: string }) {
  if (data.length === 0) return <p className="py-6 text-center text-sm text-ink-3">No data for this chart yet.</p>;
  const height = Math.max(120, data.length * 30 + 24);
  return (
    <figure>
      <div style={{ height }} role="img" aria-label={`${label}: bar chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" tickFormatter={formatters[format]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} interval={0} />
            <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.label} fill={d.highlight ? "var(--accent-strong)" : "var(--series-1)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-ink-3">
        <summary className="cursor-pointer select-none">View as table</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr><th className="py-1 font-medium">Category</th><th className="py-1 text-right font-medium">Value</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-border">
                <td className="py-1 text-ink-2">{d.label}</td>
                <td className="tabular py-1 text-right text-ink">{formatters[format](d.value)}{d.note ? ` · ${d.note}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
