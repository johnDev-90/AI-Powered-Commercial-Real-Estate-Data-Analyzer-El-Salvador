"use client";

import Link from "next/link";
import { useState } from "react";
import { PROPERTY_TYPE_LABELS } from "@/lib/domain/labels";
import { formatArea, formatUsd, formatUsdPerM2 } from "@/lib/format";
import type { PropertyDTO } from "@/lib/services/dto";
import { CompareIcon } from "./icons";
import { Badge, ButtonLink, Td, Th, VerificationBadge } from "./ui";

export const MAX_COMPARE = 6;

export function PropertyTable({ items }: { items: Array<PropertyDTO & { openIssues: number }> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_COMPARE ? s : [...s, id]));

  return (
    <div>
      <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2 text-sm text-ink-2">
        <span>{selected.length > 0 ? `${selected.length} selected for comparison (max ${MAX_COMPARE})` : "Select up to 6 properties to compare."}</span>
        {selected.length >= 2 && (
          <ButtonLink href={`/compare?ids=${selected.join(",")}`} variant="primary">
            <CompareIcon />
            Compare {selected.length}
          </ButtonLink>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface-1">
        <table className="w-full min-w-[960px] border-collapse">
          <thead>
            <tr>
              <Th className="w-8"><span className="sr-only">Select</span></Th>
              <Th>Property</Th>
              <Th>Location</Th>
              <Th>Type</Th>
              <Th align="right">Asking price</Th>
              <Th align="right">Land</Th>
              <Th align="right">Building</Th>
              <Th align="right">Price / m²</Th>
              <Th>Verification</Th>
              <Th align="right">Open issues</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-surface-0">
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${p.referenceCode ?? p.name ?? p.id} for comparison`}
                    checked={selected.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    disabled={!selected.includes(p.id) && selected.length >= MAX_COMPARE}
                    className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                  />
                </Td>
                <Td className="max-w-72">
                  <Link href={`/properties/${p.id}`} className="font-medium text-ink hover:text-accent-strong hover:underline">
                    {p.name ?? <span className="italic text-ink-3">Unnamed property</span>}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                    <span className="font-mono">{p.referenceCode ?? "no ID"}</span>
                    {p.isSynthetic && <Badge tone="outline">Synthetic</Badge>}
                  </div>
                </Td>
                <Td>
                  <div>{p.municipality ?? <span className="text-ink-3">—</span>}</div>
                  <div className="text-xs text-ink-3">{p.department ?? "—"}</div>
                </Td>
                <Td className="whitespace-nowrap">{p.propertyType ? PROPERTY_TYPE_LABELS[p.propertyType] : <span className="text-ink-3">{p.rawPropertyType ?? "—"}</span>}</Td>
                <Td align="right">{formatUsd(p.askingPriceUsd)}</Td>
                <Td align="right">{formatArea(p.landAreaM2)}</Td>
                <Td align="right">{formatArea(p.buildingAreaM2)}</Td>
                <Td align="right">{formatUsdPerM2(p.pricePerM2Usd)}</Td>
                <Td><VerificationBadge status={p.verificationStatus} /></Td>
                <Td align="right">
                  {p.openIssues > 0 ? (
                    <Link href={`/issues?property=${p.id}`} className="font-medium text-ink hover:underline">{p.openIssues}</Link>
                  ) : (
                    <span className="text-ink-3">0</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
