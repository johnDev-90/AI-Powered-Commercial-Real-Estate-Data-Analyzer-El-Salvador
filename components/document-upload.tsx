"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UploadIcon } from "./icons";
import { Button, Notice, labelClass } from "./ui";

const MAX_BYTES = 4 * 1024 * 1024;

export function DocumentUpload({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error" | "warning"; text: string; documentId?: string } | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setResult({ tone: "error", text: "The file exceeds 4 MB." });
      return;
    }
    setPending(true);
    setResult(null);
    const form = new FormData();
    form.set("propertyId", propertyId);
    form.set("file", file);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setResult({ tone: "error", text: body?.error ?? "Upload failed." });
      } else if (body.analysisError) {
        setResult({ tone: "warning", text: body.analysisError, documentId: body.documentId });
      } else {
        setResult({
          tone: "success",
          text: `Analyzed with ${body.method === "AI" ? "AI extraction" : "rule-based extraction"}: ${body.mismatches} difference(s) from the record flagged for review.${body.aiError ? ` (AI unavailable: ${body.aiError})` : ""}`,
          documentId: body.documentId,
        });
        setFile(null);
        (e.target as HTMLFormElement).reset();
      }
      router.refresh();
    } catch {
      setResult({ tone: "error", text: "Network error during upload." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={upload} className="space-y-2">
      <label htmlFor={`doc-${propertyId}`} className={labelClass}>Upload a PDF (text-based, max 4 MB)</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`doc-${propertyId}`}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-ink-2 file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface-1 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-2"
        />
        <Button type="submit" disabled={!file || pending}>
          <UploadIcon />
          {pending ? "Extracting and analyzing…" : "Upload and analyze"}
        </Button>
      </div>
      <p className="text-xs text-ink-3">
        Documents are treated as untrusted input. Sample PDFs: <a className="underline" href="/samples/docs/SYN-SS-0001-property-summary.pdf" download>property summary</a>,{" "}
        <a className="underline" href="/samples/docs/SYN-AC-0003-broker-sheet.pdf" download>broker sheet (includes a prompt-injection test)</a>.
      </p>
      {result && (
        <Notice tone={result.tone}>
          {result.text} {result.documentId && <a href={`/documents/${result.documentId}`} className="font-medium underline">Open document</a>}
        </Notice>
      )}
    </form>
  );
}
