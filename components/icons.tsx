import type { SVGProps } from "react";

// Small inline icon set (stroke icons, 24px grid) to avoid an icon dependency.
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const DashboardIcon = (p: IconProps) => <Icon {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Icon>;
export const BuildingIcon = (p: IconProps) => <Icon {...p}><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M16 9h2a2 2 0 0 1 2 2v10" /><path d="M8 7h4M8 11h4M8 15h4M3 21h18" /></Icon>;
export const UploadIcon = (p: IconProps) => <Icon {...p}><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></Icon>;
export const AlertIcon = (p: IconProps) => <Icon {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></Icon>;
export const CompareIcon = (p: IconProps) => <Icon {...p}><path d="M8 3v18M16 3v18" /><path d="M3 8h5M3 16h5M16 8h5M16 16h5" /></Icon>;
export const ChartIcon = (p: IconProps) => <Icon {...p}><path d="M3 3v18h18" /><path d="M7 15v3M11 10v8M15 12v6M19 6v12" /></Icon>;
export const SparkIcon = (p: IconProps) => <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></Icon>;
export const FileIcon = (p: IconProps) => <Icon {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></Icon>;
export const SearchIcon = (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
export const DownloadIcon = (p: IconProps) => <Icon {...p}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></Icon>;
export const CheckIcon = (p: IconProps) => <Icon {...p}><path d="m5 12 5 5 9-10" /></Icon>;
export const XIcon = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const InfoIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icon>;
export const ArrowLeftIcon = (p: IconProps) => <Icon {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>;
export const PlusIcon = (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const RefreshIcon = (p: IconProps) => <Icon {...p}><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4" /></Icon>;
export const DatabaseIcon = (p: IconProps) => <Icon {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></Icon>;

/** Severity glyphs: shape differs per level so severity never relies on color alone. */
export function SeverityGlyph({ severity }: { severity: "HIGH" | "MEDIUM" | "LOW" }) {
  if (severity === "HIGH") return <svg viewBox="0 0 12 12" width={10} height={10} aria-hidden="true"><path d="M6 1 11 11H1Z" fill="var(--status-critical)" /></svg>;
  if (severity === "MEDIUM") return <svg viewBox="0 0 12 12" width={10} height={10} aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx="1" transform="rotate(45 6 6)" fill="var(--status-serious)" /></svg>;
  return <svg viewBox="0 0 12 12" width={10} height={10} aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="var(--status-warning)" /></svg>;
}
