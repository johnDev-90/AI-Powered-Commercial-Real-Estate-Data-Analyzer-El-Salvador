"use client";

import { Button, Notice } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const dbMissing = /DATABASE_URL|ECONNREFUSED|Can't reach database|connect/i.test(error.message);
  return (
    <div className="mx-auto max-w-xl py-12">
      <Notice tone="error" title={dbMissing ? "The database is not reachable" : "Something went wrong"}>
        {dbMissing ? (
          <>
            Check that <code>DATABASE_URL</code> points to a running PostgreSQL database and that migrations have been applied
            (<code>npm run db:migrate</code>). On Vercel, connect a Postgres database (e.g. Neon) to the project and redeploy.
          </>
        ) : (
          <>The page could not be loaded. {error.digest && <span className="text-ink-3">Reference: {error.digest}</span>}</>
        )}
      </Notice>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
