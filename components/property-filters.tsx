import { PROPERTY_TYPE_LABELS, PROPERTY_TYPES, VERIFICATION_LABELS, VERIFICATION_STATUSES } from "@/lib/domain/labels";
import type { PropertyListQuery } from "@/lib/validation/property";
import { SearchIcon } from "./icons";
import { Button, ButtonLink, inputClass, labelClass } from "./ui";

/** GET form: filters live in the URL so results are shareable and work without JS. */
export function PropertyFilters({
  action,
  query,
  facets,
  showSort = true,
}: {
  action: string;
  query: Partial<PropertyListQuery>;
  facets: { municipalities: string[]; departments: string[] };
  showSort?: boolean;
}) {
  return (
    <form action={action} method="get" className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-1 p-3 sm:grid-cols-2 lg:grid-cols-6" role="search">
      <div className="sm:col-span-2">
        <label htmlFor="q" className={labelClass}>Search</label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
          <input id="q" name="q" defaultValue={query.q ?? ""} placeholder="Name, address, property or cadastral ID" className={`${inputClass} pl-8`} />
        </div>
      </div>
      <div>
        <label htmlFor="municipality" className={labelClass}>Municipality</label>
        <select id="municipality" name="municipality" defaultValue={query.municipality ?? ""} className={inputClass}>
          <option value="">All</option>
          {facets.municipalities.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="department" className={labelClass}>Department</label>
        <select id="department" name="department" defaultValue={query.department ?? ""} className={inputClass}>
          <option value="">All</option>
          {facets.departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="type" className={labelClass}>Property type</label>
        <select id="type" name="type" defaultValue={query.type ?? ""} className={inputClass}>
          <option value="">All</option>
          {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="verification" className={labelClass}>Verification</label>
        <select id="verification" name="verification" defaultValue={query.verification ?? ""} className={inputClass}>
          <option value="">All</option>
          {VERIFICATION_STATUSES.map((v) => <option key={v} value={v}>{VERIFICATION_LABELS[v]}</option>)}
          <option value="MISSING">Not recorded</option>
        </select>
      </div>
      <div>
        <label htmlFor="issues" className={labelClass}>Data quality</label>
        <select id="issues" name="issues" defaultValue={query.issues ?? ""} className={inputClass}>
          <option value="">All records</option>
          <option value="open">With open issues</option>
          <option value="none">Without open issues</option>
        </select>
      </div>
      {showSort && (
        <div>
          <label htmlFor="sort" className={labelClass}>Sort by</label>
          <select id="sort" name="sort" defaultValue={query.sort ?? "updated"} className={inputClass}>
            <option value="updated">Recently updated</option>
            <option value="name">Name (A–Z)</option>
            <option value="price">Asking price (low → high)</option>
            <option value="priceDesc">Asking price (high → low)</option>
            <option value="pricePerM2">Price per m² (low → high)</option>
            <option value="pricePerM2Desc">Price per m² (high → low)</option>
            <option value="area">Land area (largest)</option>
            <option value="issues">Most issues</option>
          </select>
        </div>
      )}
      <div className="flex items-end gap-2 lg:col-span-2">
        <Button type="submit" variant="primary">Apply filters</Button>
        <ButtonLink href={action} variant="ghost">Reset</ButtonLink>
      </div>
    </form>
  );
}
