import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { IssueSeverity, IssueStatus, VerificationStatus } from "@/lib/generated/prisma/enums";
import { SEVERITY_LABELS, STATUS_LABELS, VERIFICATION_LABELS } from "@/lib/domain/labels";
import { SeverityGlyph } from "./icons";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium text-ink-3">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className, title, description, actions }: { children: ReactNode; className?: string; title?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-lg border border-border bg-surface-1", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const buttonStyles = {
  primary: "bg-accent text-white hover:bg-accent-strong border-transparent",
  secondary: "bg-surface-1 text-ink border-border-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-surface-2",
  danger: "bg-surface-1 text-critical-text border-border-strong hover:bg-surface-2",
} as const;
type ButtonVariant = keyof typeof buttonStyles;
const buttonBase = "inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";

export function Button({ variant = "secondary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "secondary", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

/** Plain anchor for downloads / route handlers (not client-side navigation). */
export function ButtonAnchor({ variant = "secondary", className, ...props }: ComponentProps<"a"> & { variant?: ButtonVariant }) {
  return <a className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function Badge({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "critical" | "outline"; className?: string; title?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2 border-transparent",
    accent: "bg-accent-soft text-accent-strong border-transparent",
    good: "bg-[#e7f5e7] text-good-text border-transparent",
    critical: "bg-[#fbeaea] text-critical-text border-transparent",
    outline: "bg-transparent text-ink-2 border-border-strong",
  };
  return <span title={title} className={cx("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink whitespace-nowrap">
      <SeverityGlyph severity={severity} />
      {SEVERITY_LABELS[severity]}
    </span>
  );
}

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  const tone = status === "OPEN" ? "accent" : status === "RESOLVED" ? "good" : "neutral";
  return <Badge tone={tone}>{STATUS_LABELS[status]}</Badge>;
}

export function VerificationBadge({ status }: { status: VerificationStatus | null }) {
  if (!status) return <Badge tone="outline">Not recorded</Badge>;
  const tone = status === "VERIFIED" ? "good" : status === "UNVERIFIED" ? "neutral" : "accent";
  return <Badge tone={tone} title={status === "VERIFIED" ? "Marked verified by a user; not an official verification." : undefined}>{VERIFICATION_LABELS[status]}</Badge>;
}

export function SyntheticBadge() {
  return <Badge tone="outline" title="Fictional demo data generated for testing. Not real listings.">Synthetic</Badge>;
}

export function StatTile({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </>
  );
  const classes = "block rounded-lg border border-border bg-surface-1 px-4 py-3";
  return href ? <Link href={href} className={cx(classes, "transition-colors hover:border-border-strong")}>{body}</Link> : <div className={classes}>{body}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface-1 px-6 py-12 text-center">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-ink-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warning" | "error" | "success"; title?: string; children: ReactNode }) {
  const tones = {
    info: "border-[#cde2fb] bg-accent-soft text-ink",
    warning: "border-[#f5d58a] bg-[#fdf6e3] text-ink",
    error: "border-[#f1c4c4] bg-[#fbeaea] text-ink",
    success: "border-[#bfe3bf] bg-[#ecf7ec] text-ink",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-md border px-3 py-2 text-sm", tones[tone])}>
      {title && <div className="font-semibold">{title}</div>}
      <div className={title ? "mt-0.5 text-ink-2" : undefined}>{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded bg-surface-2", className)} />;
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-1 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-7 w-full" />)}
    </div>
  );
}

export function DefinitionList({ items }: { items: Array<{ label: string; value: ReactNode; hint?: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-ink-3">{item.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{item.value}</dd>
          {item.hint && <dd className="mt-0.5 text-xs text-ink-3">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

export const inputClass = "w-full rounded-md border border-border-strong bg-surface-1 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";
export const labelClass = "mb-1 block text-xs font-medium text-ink-2";

export function Th({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" }) {
  return <th scope="col" className={cx("border-b border-border bg-surface-2 px-3 py-2 text-xs font-medium text-ink-2 whitespace-nowrap", align === "right" ? "text-right" : "text-left", className)}>{children}</th>;
}

export function Td({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" }) {
  return <td className={cx("border-b border-border px-3 py-2 align-top text-sm text-ink", align === "right" && "tabular text-right", className)}>{children}</td>;
}

export function Pagination({ page, pageCount, total, hrefFor }: { page: number; pageCount: number; total: number; hrefFor: (page: number) => string }) {
  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center justify-between text-sm text-ink-2">
      <span className="tabular">{total.toLocaleString("en-US")} result{total === 1 ? "" : "s"} · page {page} of {pageCount}</span>
      <div className="flex gap-2">
        {page > 1 ? <ButtonLink href={hrefFor(page - 1)}>Previous</ButtonLink> : <Button disabled>Previous</Button>}
        {page < pageCount ? <ButtonLink href={hrefFor(page + 1)}>Next</ButtonLink> : <Button disabled>Next</Button>}
      </div>
    </nav>
  );
}

/** Rebuild a URL from current params with overrides (server-side helper for links). */
export function withParams(path: string, params: Record<string, string | undefined>, overrides: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...overrides })) {
    if (v !== undefined && v !== "" && v !== null) sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}
