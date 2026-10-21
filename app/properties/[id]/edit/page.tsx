import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PropertyForm } from "@/components/property-form";
import { Notice, PageHeader, TableSkeleton } from "@/components/ui";
import { getDb } from "@/lib/db";
import { toPropertyDTO } from "@/lib/services/dto";

export const metadata: Metadata = { title: "Edit property" };

export default function EditPropertyPage({ params }: PageProps<"/properties/[id]/edit">) {
  return (
    <>
      <PageHeader title="Edit property" description="The original imported row is kept unchanged for traceability. Saving re-runs the data quality analysis." />
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <EditContent params={params} />
      </Suspense>
    </>
  );
}

async function EditContent({ params }: { params: PageProps<"/properties/[id]/edit">["params"] }) {
  const { id } = await params;
  const property = await getDb().property.findUnique({ where: { id } });
  if (!property) notFound();
  return (
    <div className="max-w-4xl space-y-4">
      {property.isSynthetic && <Notice tone="info">This is a synthetic demo record. Edits change the demo database only.</Notice>}
      <PropertyForm property={toPropertyDTO(property)} />
    </div>
  );
}
