"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TARGET_FIELDS, type ColumnMapping, type ImportOptions, type TargetField } from "@/lib/csv/mapping";
import { AREA_UNIT_LABELS, AREA_UNITS, type AreaUnit } from "@/lib/domain/area-units";
import { formatDateTime } from "@/lib/format";
import { UploadIcon } from "./icons";
import { Button, Card, Notice, inputClass, labelClass } from "./ui";

interface UploadResult {
  importId: string;
  headers: string[];
  totalRows: number;
  preview: Array<Record<string, string>>;
  suggestedMapping: ColumnMapping;
  suggestedOptions: { landAreaUnit: AreaUnit; buildingAreaUnit: AreaUnit };
  previousImport: { id: string; createdAt: string } | null;
}

interface CommitResult {
  importId: string;
  accepted: number;
  flagged: number;
  rejected: number;
  analysis: { issuesDetected: number; issuesNew: number } | null;
  analysisError?: string;
}

const MAX_BYTES = 4 * 1024 * 1024;

export function ImportWizard({ initial }: { initial?: UploadResult }) {
  const router = useRouter();
  const [upload, setUpload] = useState<UploadResult | null>(initial ?? null);
  const [mapping, setMapping] = useState<ColumnMapping>(initial?.suggestedMapping ?? {});
  const [options, setOptions] = useState<ImportOptions>({
    decimalSeparator: ".",
    dateFormat: "DMY",
    landAreaUnit: initial?.suggestedOptions.landAreaUnit ?? "M2",
    buildingAreaUnit: initial?.suggestedOptions.buildingAreaUnit ?? "M2",
    isSynthetic: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  const missingRequired = useMemo(() => TARGET_FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label), [mapping]);
  const duplicateTargets = useMemo(() => {
    const used = Object.values(mapping).filter(Boolean);
    return [...new Set(used.filter((h, i) => used.indexOf(h) !== i))];
  }, [mapping]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("The file exceeds 4 MB.");
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    try {
      const res = await fetch("/api/imports", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) return setError(body?.error ?? "Upload failed.");
      const data = body as UploadResult;
      setUpload(data);
      setMapping(data.suggestedMapping);
      // Spanish-format files commonly use ";" with comma decimals.
      const looksCommaDecimal = data.preview.some((row) => Object.values(row).some((v) => /^\d{1,3}(\.\d{3})+,\d{2}$/.test(v)));
      setOptions((o) => ({ ...o, ...data.suggestedOptions, decimalSeparator: looksCommaDecimal ? "," : "." }));
    } catch {
      setError("Network error during upload.");
    } finally {
      setPending(false);
    }
  }

  async function onCommit() {
    if (!upload) return;
    setPending(true);
    setError(null);
    const cleanMapping = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
    try {
      const res = await fetch(`/api/imports/${upload.importId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping: cleanMapping, options }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) return setError(body?.error ?? "Import failed.");
      setResult(body as CommitResult);
      router.refresh();
    } catch {
      setError("Network error during import. Check the import history before retrying.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <Card title="Import complete">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Accepted" value={result.accepted} hint="No issues detected" />
          <Stat label="Flagged" value={result.flagged} hint="Imported with issues to review" />
          <Stat label="Rejected" value={result.rejected} hint="Not imported (unidentifiable)" />
        </div>
        <div className="mt-4 space-y-2">
          {result.analysis ? (
            <Notice tone="success">Analysis ran across all records: {result.analysis.issuesDetected} open issues, {result.analysis.issuesNew} new.</Notice>
          ) : (
            <Notice tone="warning">The records were imported, but the analysis failed: {result.analysisError}. Re-run it from the dashboard.</Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={`/imports/${result.importId}`} className="text-sm font-medium text-accent-strong underline">View import summary</Link>
            <Link href="/issues" className="text-sm font-medium text-accent-strong underline">Review issues</Link>
            <button type="button" className="text-sm text-ink-2 underline" onClick={() => { setUpload(null); setResult(null); setFile(null); setMapping({}); }}>Import another file</button>
          </div>
        </div>
      </Card>
    );
  }

  if (!upload) {
    return (
      <Card title="1. Upload a CSV file" description="Comma, semicolon or tab separated, with a header row. Max 4 MB / 5,000 rows.">
        <form onSubmit={onUpload} className="space-y-3">
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm text-ink-2 file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface-1 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-2"
          />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" variant="primary" disabled={!file || pending}>
            <UploadIcon />
            {pending ? "Reading file…" : "Upload and map columns"}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {upload.previousImport && (
        <Notice tone="warning" title="This exact file was imported before">
          An identical file was imported on {formatDateTime(upload.previousImport.createdAt)}. Importing again creates new records, which will be flagged as duplicates.
        </Notice>
      )}
      <Card title={`2. Map columns (${upload.totalRows} rows)`} description="Suggested from header names (English and Spanish). Unmapped columns are kept in the raw row for provenance.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TARGET_FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`map-${f.key}`} className={labelClass}>{f.label}{f.required ? " *" : ""}</label>
              <select
                id={`map-${f.key}`}
                value={mapping[f.key] ?? ""}
                onChange={(e) => setMapping((m) => ({ ...m, [f.key as TargetField]: e.target.value || undefined }))}
                className={inputClass}
              >
                <option value="">— Not mapped —</option>
                {upload.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
        {missingRequired.length > 0 && (
          <p className="mt-3 text-xs text-ink-2">Not mapped: {missingRequired.join(", ")}. Records will be imported and flagged as missing these fields.</p>
        )}
        {duplicateTargets.length > 0 && <div className="mt-3"><Notice tone="warning">Column(s) mapped more than once: {duplicateTargets.join(", ")}.</Notice></div>}
      </Card>

      <Card title="3. Parsing options">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="opt-decimal" className={labelClass}>Number format</label>
            <select id="opt-decimal" value={options.decimalSeparator} onChange={(e) => setOptions((o) => ({ ...o, decimalSeparator: e.target.value as "." | "," }))} className={inputClass}>
              <option value=".">1,250,000.50 (period decimals)</option>
              <option value=",">1.250.000,50 (comma decimals)</option>
            </select>
          </div>
          <div>
            <label htmlFor="opt-land" className={labelClass}>Land area unit</label>
            <select id="opt-land" value={options.landAreaUnit} onChange={(e) => setOptions((o) => ({ ...o, landAreaUnit: e.target.value as AreaUnit }))} className={inputClass}>
              {AREA_UNITS.map((u) => <option key={u} value={u}>{AREA_UNIT_LABELS[u]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="opt-building" className={labelClass}>Building area unit</label>
            <select id="opt-building" value={options.buildingAreaUnit} onChange={(e) => setOptions((o) => ({ ...o, buildingAreaUnit: e.target.value as AreaUnit }))} className={inputClass}>
              {AREA_UNITS.map((u) => <option key={u} value={u}>{AREA_UNIT_LABELS[u]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="opt-date" className={labelClass}>Date format (non-ISO)</label>
            <select id="opt-date" value={options.dateFormat} onChange={(e) => setOptions((o) => ({ ...o, dateFormat: e.target.value as "DMY" | "MDY" }))} className={inputClass}>
              <option value="DMY">DD/MM/YYYY</option>
              <option value="MDY">MM/DD/YYYY</option>
            </select>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={options.isSynthetic} onChange={(e) => setOptions((o) => ({ ...o, isSynthetic: e.target.checked }))} className="h-4 w-4 accent-[var(--accent)]" />
          This file contains synthetic / test data
        </label>
        <p className="mt-2 text-xs text-ink-3">Areas are stored in m² (1 v² = 0.698896 m²; 1 manzana = 6,988.96 m²). Original values stay in the raw row.</p>
      </Card>

      <Card title="Preview (first 5 rows, as uploaded)">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>{upload.headers.map((h) => <th key={h} className="border-b border-border px-2 py-1 text-left font-medium whitespace-nowrap text-ink-2">{h}</th>)}</tr></thead>
            <tbody>
              {upload.preview.map((row, i) => (
                <tr key={i}>{upload.headers.map((h) => <td key={h} className="max-w-48 truncate border-b border-border px-2 py-1 text-ink" title={row[h]}>{row[h]}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="primary" onClick={onCommit} disabled={pending || duplicateTargets.length > 0 || Object.values(mapping).filter(Boolean).length === 0}>
          {pending ? "Importing and analyzing…" : `Import ${upload.totalRows} rows`}
        </Button>
        <Button variant="ghost" onClick={() => { setUpload(null); setError(null); }}>Choose a different file</Button>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="tabular text-2xl font-semibold text-ink">{value}</div>
      <div className="text-sm font-medium text-ink">{label}</div>
      <div className="text-xs text-ink-3">{hint}</div>
    </div>
  );
}
