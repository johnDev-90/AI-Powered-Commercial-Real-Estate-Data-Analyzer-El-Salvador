"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertIcon, BuildingIcon, ChartIcon, CompareIcon, DashboardIcon, SparkIcon, UploadIcon } from "./icons";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: DashboardIcon },
  { href: "/properties", label: "Properties", icon: BuildingIcon },
  { href: "/imports", label: "Imports", icon: UploadIcon },
  { href: "/issues", label: "Data quality", icon: AlertIcon },
  { href: "/compare", label: "Compare", icon: CompareIcon },
  { href: "/market", label: "Market analysis", icon: ChartIcon },
  { href: "/investigate", label: "AI investigation", icon: SparkIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <aside className="border-b border-border bg-surface-1 lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 lg:border-r lg:border-b-0">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-white" aria-hidden="true">SV</div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-ink">CRE Data Analyzer</div>
          <div className="text-xs text-ink-3">El Salvador · commercial</div>
        </div>
      </div>
      <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cx(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
              isActive(href) ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon />
            {label}
          </Link>
        ))}
      </nav>
      <div className="hidden px-4 pt-6 text-xs leading-relaxed text-ink-3 lg:absolute lg:bottom-4 lg:block">
        Asking prices are listing data, not transaction prices or valuations. Demo records are synthetic.
      </div>
    </aside>
  );
}
