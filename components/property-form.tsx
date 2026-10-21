"use client";

import { useActionState } from "react";
import { savePropertyAction, type ActionState } from "@/lib/actions";
import { DEPARTMENTS } from "@/lib/domain/geography";
import { PROPERTY_TYPE_LABELS, PROPERTY_TYPES, VERIFICATION_LABELS, VERIFICATION_STATUSES } from "@/lib/domain/labels";
import type { PropertyDTO } from "@/lib/services/dto";
import { Button, ButtonLink, Notice, inputClass, labelClass } from "./ui";

const initial: ActionState = { ok: false };

function Field({ name, label, error, hint, children }: { name: string; label: string; error?: string[]; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      {error && <p id={`${name}-error`} className="mt-1 text-xs text-critical-text">{error[0]}</p>}
    </div>
  );
}

export function PropertyForm({ property }: { property?: PropertyDTO }) {
  const [state, action, pending] = useActionState(savePropertyAction, initial);
  const e = state.fieldErrors ?? {};
  const aria = (name: string) => (e[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {});
  const v = property;

  return (
    <form action={action} className="space-y-6" noValidate>
      {v && <input type="hidden" name="id" value={v.id} />}
      {state.message && !state.ok && <Notice tone="error">{state.message}</Notice>}

      <fieldset className="grid gap-4 rounded-lg border border-border bg-surface-1 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-ink">Identification</legend>
        <Field name="name" label="Property name *" error={e.name}>
          <input id="name" name="name" required maxLength={200} defaultValue={v?.name ?? ""} className={inputClass} {...aria("name")} />
        </Field>
        <Field name="referenceCode" label="Property ID" error={e.referenceCode} hint="Source identifier. Duplicates are allowed but flagged.">
          <input id="referenceCode" name="referenceCode" maxLength={60} defaultValue={v?.referenceCode ?? ""} className={`${inputClass} font-mono`} {...aria("referenceCode")} />
        </Field>
        <Field name="propertyType" label="Property type *" error={e.propertyType}>
          <select id="propertyType" name="propertyType" required defaultValue={v?.propertyType ?? ""} className={inputClass} {...aria("propertyType")}>
            <option value="" disabled>Select a type</option>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field name="cadastralId" label="Parcel / cadastral ID" error={e.cadastralId} hint="Only if known. Not verified by this application.">
          <input id="cadastralId" name="cadastralId" maxLength={80} defaultValue={v?.cadastralId ?? ""} className={`${inputClass} font-mono`} {...aria("cadastralId")} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-border bg-surface-1 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-ink">Location</legend>
        <div className="sm:col-span-2">
          <Field name="address" label="Address *" error={e.address}>
            <input id="address" name="address" required maxLength={300} defaultValue={v?.address ?? ""} className={inputClass} {...aria("address")} />
          </Field>
        </div>
        <Field name="municipality" label="Municipality / district *" error={e.municipality} hint="Former municipality names (now districts) are accepted.">
          <input id="municipality" name="municipality" required maxLength={100} defaultValue={v?.municipality ?? ""} className={inputClass} {...aria("municipality")} />
        </Field>
        <Field name="department" label="Department *" error={e.department}>
          <select id="department" name="department" required defaultValue={v?.department ?? ""} className={inputClass} {...aria("department")}>
            <option value="" disabled>Select a department</option>
            {v?.department && !DEPARTMENTS.some((d) => d.name === v.department) && <option value={v.department}>{v.department} (not in reference list)</option>}
            {DEPARTMENTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-border bg-surface-1 p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold text-ink">Areas and asking price</legend>
        <Field name="landAreaM2" label="Land area (m²)" error={e.landAreaM2}>
          <input id="landAreaM2" name="landAreaM2" inputMode="decimal" defaultValue={v?.landAreaM2 ?? ""} className={`${inputClass} tabular`} {...aria("landAreaM2")} />
        </Field>
        <Field name="buildingAreaM2" label="Building area (m²)" error={e.buildingAreaM2}>
          <input id="buildingAreaM2" name="buildingAreaM2" inputMode="decimal" defaultValue={v?.buildingAreaM2 ?? ""} className={`${inputClass} tabular`} {...aria("buildingAreaM2")} />
        </Field>
        <Field name="askingPriceUsd" label="Asking price (USD)" error={e.askingPriceUsd} hint="Listing price, not a transaction price.">
          <input id="askingPriceUsd" name="askingPriceUsd" inputMode="decimal" defaultValue={v?.askingPriceUsd ?? ""} className={`${inputClass} tabular`} {...aria("askingPriceUsd")} />
        </Field>
        <p className="text-xs text-ink-3 sm:col-span-3">Price per m² is calculated automatically: land area for commercial land, building area for built properties.</p>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-border bg-surface-1 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-ink">Documentation</legend>
        <Field name="verificationStatus" label="Verification status" error={e.verificationStatus} hint="User-attested. Not an official verification.">
          <select id="verificationStatus" name="verificationStatus" defaultValue={v?.verificationStatus ?? ""} className={inputClass}>
            <option value="">Not recorded</option>
            {VERIFICATION_STATUSES.map((s) => <option key={s} value={s}>{VERIFICATION_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field name="zoning" label="Zoning / land use" error={e.zoning} hint="As stated by the source; unverified.">
          <input id="zoning" name="zoning" maxLength={200} defaultValue={v?.zoning ?? ""} className={inputClass} />
        </Field>
        <Field name="sourceUpdatedAt" label="Last updated (source)" error={e.sourceUpdatedAt}>
          <input id="sourceUpdatedAt" name="sourceUpdatedAt" type="date" defaultValue={v?.sourceUpdatedAt?.slice(0, 10) ?? ""} className={inputClass} {...aria("sourceUpdatedAt")} />
        </Field>
        <div className="sm:col-span-2">
          <Field name="description" label="Description" error={e.description}>
            <textarea id="description" name="description" rows={4} maxLength={4000} defaultValue={v?.description ?? ""} className={inputClass} />
          </Field>
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving and re-analyzing…" : v ? "Save changes" : "Create property"}</Button>
        <ButtonLink href={v ? `/properties/${v.id}` : "/properties"} variant="ghost">Cancel</ButtonLink>
      </div>
    </form>
  );
}
