"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshIcon } from "./icons";
import { Button } from "./ui";

export function ReanalyzeDocumentButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {message && <span className="text-xs text-ink-2">{message}</span>}
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setMessage(null);
          const res = await fetch(`/api/documents/${documentId}/analyze`, { method: "POST" }).catch(() => null);
          const body = await res?.json().catch(() => null);
          setMessage(res?.ok ? `Re-analyzed: ${body.mismatches} difference(s).` : body?.error ?? "Re-analysis failed.");
          setPending(false);
          router.refresh();
        }}
      >
        <RefreshIcon />
        {pending ? "Analyzing…" : "Re-analyze"}
      </Button>
    </div>
  );
}
