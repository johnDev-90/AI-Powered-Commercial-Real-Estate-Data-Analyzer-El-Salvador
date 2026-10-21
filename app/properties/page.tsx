import type { Metadata } from "next";
import { Suspense } from "react";
import { DownloadIcon, PlusIcon } from "@/components/icons";
import { PropertyFilters } from "@/components/property-filters";
import { PropertyTable } from "@/components/property-table";
import { ButtonAnchor, ButtonLink, EmptyState, PageHeader, Pagination, TableSkeleton, withParams } from "@/components/ui";
import { getLocationFacets, listProperties } from "@/lib/services/properties";
import { propertyListQuerySchema, searchParamsToObject } from "@/lib/validation/property";

export const metadata: Metadata = { title: "Properties" };

export default function PropertiesPage({ searchParams }: PageProps<"/properties">) {
  return (
    <>
      <PageHeader
        title="Properties"
        description="Commercial property records. Prices are asking prices in USD; cadastral, zoning and legal information is unverified unless stated."
        actions={<ButtonLink href="/properties/new" variant="primary"><PlusIcon />New property</ButtonLink>}
      />
      <Suspense fallback={<TableSkeleton />}>
        <PropertiesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PropertiesContent({ searchParams }: { searchParams: PageProps<"/properties">["searchParams"] }) {
  const raw = searchParamsToObject(await searchParams);
  const query = propertyListQuerySchema.parse(raw);
  const [result, facets] = await Promise.all([listProperties(query), getLocationFacets()]);
  const { page: _page, ...filterParams } = raw;
  const exportHref = withParams("/api/export/properties", filterParams, {});

  return (
    <>
      <PropertyFilters action="/properties" query={query} facets={facets} />
      {result.total === 0 ? (
        <EmptyState
          title="No properties match these filters"
          description="Adjust or reset the filters, or import a CSV file."
          action={<ButtonLink href="/imports">Import CSV</ButtonLink>}
        />
      ) : (
        <>
          <div className="mb-2 flex justify-end">
            <ButtonAnchor href={exportHref} variant="ghost"><DownloadIcon />Export {result.total} to CSV</ButtonAnchor>
          </div>
          <PropertyTable items={result.items} />
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} hrefFor={(p) => withParams("/properties", raw, { page: p })} />
        </>
      )}
    </>
  );
}
