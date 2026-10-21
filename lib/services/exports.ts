import "server-only";
import { csvResponse, toCsv, type CsvColumn } from "@/lib/csv/export";
import { getDb } from "@/lib/db";
import { PROPERTY_TYPE_LABELS } from "@/lib/domain/labels";
import { ruleLabel } from "@/lib/quality/rule-codes";
import type { IssueListQuery } from "@/lib/validation/issues";
import type { PropertyListQuery } from "@/lib/validation/property";
import { getComparison } from "./compare";
import { toPropertyDTO, type PropertyDTO } from "./dto";
import { listIssuesForExport, type IssueDTO } from "./issues";
import { propertyWhere } from "./properties";

const EXPORT_LIMIT = 10_000;
const stamp = () => new Date().toISOString().slice(0, 10);

const PROPERTY_COLUMNS: CsvColumn<PropertyDTO & { openIssues?: number }>[] = [
  { header: "record_id", value: (p) => p.id },
  { header: "property_id", value: (p) => p.referenceCode },
  { header: "property_name", value: (p) => p.name },
  { header: "address", value: (p) => p.address },
  { header: "municipality", value: (p) => p.municipality },
  { header: "department", value: (p) => p.department },
  { header: "property_type", value: (p) => (p.propertyType ? PROPERTY_TYPE_LABELS[p.propertyType] : p.rawPropertyType) },
  { header: "cadastral_id", value: (p) => p.cadastralId },
  { header: "land_area_m2", value: (p) => p.landAreaM2 },
  { header: "building_area_m2", value: (p) => p.buildingAreaM2 },
  { header: "asking_price_usd", value: (p) => p.askingPriceUsd },
  { header: "asking_price_per_m2_usd", value: (p) => p.pricePerM2Usd },
  { header: "price_per_m2_basis", value: (p) => p.pricePerM2Basis },
  { header: "zoning_as_stated", value: (p) => p.zoning },
  { header: "verification_status", value: (p) => p.verificationStatus ?? "NOT_RECORDED" },
  { header: "open_issues", value: (p) => p.openIssues },
  { header: "record_source", value: (p) => p.source },
  { header: "is_synthetic", value: (p) => (p.isSynthetic ? "yes" : "no") },
  { header: "source_last_updated", value: (p) => p.sourceUpdatedAt?.slice(0, 10) },
  { header: "price_note", value: () => "Asking price (listing); not a transaction price or valuation" },
];

export async function exportProperties(query: Partial<PropertyListQuery>): Promise<Response> {
  const rows = await getDb().property.findMany({
    where: propertyWhere(query),
    orderBy: [{ referenceCode: "asc" }, { createdAt: "asc" }],
    take: EXPORT_LIMIT,
    include: { _count: { select: { issues: { where: { status: "OPEN" } } } } },
  });
  const data = rows.map((r) => ({ ...toPropertyDTO(r), openIssues: r._count.issues }));
  return csvResponse(toCsv(data, PROPERTY_COLUMNS), `properties-${stamp()}.csv`);
}

const ISSUE_COLUMNS: CsvColumn<IssueDTO>[] = [
  { header: "issue_id", value: (i) => i.id },
  { header: "rule", value: (i) => i.ruleCode },
  { header: "issue", value: (i) => ruleLabel(i.ruleCode) },
  { header: "category", value: (i) => i.category },
  { header: "severity", value: (i) => i.severity },
  { header: "review_status", value: (i) => i.status },
  { header: "property_record_id", value: (i) => i.property.id },
  { header: "property_id", value: (i) => i.property.referenceCode },
  { header: "property_name", value: (i) => i.property.name },
  { header: "municipality", value: (i) => i.property.municipality },
  { header: "related_property_id", value: (i) => i.relatedProperty?.referenceCode },
  { header: "field", value: (i) => i.field },
  { header: "observed_value", value: (i) => i.observedValue },
  { header: "expected_value", value: (i) => i.expectedValue },
  { header: "explanation", value: (i) => i.explanation },
  { header: "recommended_next_step", value: (i) => i.recommendation },
  { header: "detected_at", value: (i) => i.detectedAt },
  { header: "document", value: (i) => i.document?.fileName },
];

export async function exportIssues(query: Partial<IssueListQuery>): Promise<Response> {
  const issues = await listIssuesForExport(query, EXPORT_LIMIT);
  return csvResponse(toCsv(issues, ISSUE_COLUMNS), `data-quality-findings-${stamp()}.csv`);
}

export async function exportComparison(ids: string[]): Promise<Response> {
  const { properties, gaps } = await getComparison(ids);
  const columns: CsvColumn<PropertyDTO & { openIssues: number }>[] = [
    ...PROPERTY_COLUMNS,
    { header: "missing_for_comparison", value: (p) => gaps.find((g) => g.propertyId === p.id)?.missing.join("; ") },
  ];
  return csvResponse(toCsv(properties, columns), `comparison-${stamp()}.csv`);
}
