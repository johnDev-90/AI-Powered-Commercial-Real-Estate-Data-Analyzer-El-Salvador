// Client-safe labels and enum helpers. Values mirror the Prisma enums.
import type {
  IssueCategory,
  IssueSeverity,
  IssueStatus,
  PropertyType,
  VerificationStatus,
} from "@/lib/generated/prisma/enums";

export const PROPERTY_TYPES = [
  "COMMERCIAL_LAND",
  "RETAIL",
  "OFFICE",
  "WAREHOUSE_INDUSTRIAL",
  "SHOPPING_CENTER",
] as const satisfies readonly PropertyType[];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  COMMERCIAL_LAND: "Commercial land",
  RETAIL: "Retail space",
  OFFICE: "Office building",
  WAREHOUSE_INDUSTRIAL: "Warehouse / industrial",
  SHOPPING_CENTER: "Shopping center",
};

export const VERIFICATION_STATUSES = [
  "UNVERIFIED",
  "PENDING_REVIEW",
  "PARTIALLY_VERIFIED",
  "VERIFIED",
] as const satisfies readonly VerificationStatus[];

/** "Verified" is always user-attested in this application, never official. */
export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  UNVERIFIED: "Unverified",
  PENDING_REVIEW: "Pending review",
  PARTIALLY_VERIFIED: "Partially verified",
  VERIFIED: "Verified (user-attested)",
};

export const ISSUE_SEVERITIES = ["HIGH", "MEDIUM", "LOW"] as const satisfies readonly IssueSeverity[];
export const ISSUE_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const satisfies readonly IssueStatus[];
export const ISSUE_CATEGORIES = [
  "COMPLETENESS",
  "DUPLICATION",
  "VALIDITY",
  "CONSISTENCY",
  "LOCATION",
  "VERIFICATION",
  "ANOMALY",
  "CLASSIFICATION",
  "DOCUMENT",
] as const satisfies readonly IssueCategory[];

export const SEVERITY_LABELS: Record<IssueSeverity, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
export const STATUS_LABELS: Record<IssueStatus, string> = { OPEN: "Open", RESOLVED: "Resolved", DISMISSED: "Dismissed" };
export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  COMPLETENESS: "Completeness",
  DUPLICATION: "Duplication",
  VALIDITY: "Validity",
  CONSISTENCY: "Consistency",
  LOCATION: "Location",
  VERIFICATION: "Verification",
  ANOMALY: "Anomaly (review)",
  CLASSIFICATION: "Classification",
  DOCUMENT: "Document mismatch",
};

/** Human-readable names for property fields referenced by issues and the AI. */
export const FIELD_LABELS: Record<string, string> = {
  referenceCode: "Property ID",
  name: "Property name",
  address: "Address",
  municipality: "Municipality",
  department: "Department",
  propertyType: "Property type",
  cadastralId: "Cadastral ID",
  landAreaM2: "Land area (m²)",
  buildingAreaM2: "Building area (m²)",
  askingPriceUsd: "Asking price (USD)",
  pricePerM2Usd: "Asking price per m²",
  sourcePricePerM2: "Source price per m²",
  description: "Description",
  zoning: "Zoning / land use",
  verificationStatus: "Verification status",
  sourceUpdatedAt: "Last updated (source)",
};

export function isPropertyType(value: string): value is PropertyType {
  return (PROPERTY_TYPES as readonly string[]).includes(value);
}

export function isVerificationStatus(value: string): value is VerificationStatus {
  return (VERIFICATION_STATUSES as readonly string[]).includes(value);
}
