import { createHash } from "node:crypto";
import type { IssueCategory, IssueSeverity, PropertyType, VerificationStatus } from "@/lib/generated/prisma/enums";
import type { Decimal } from "@/lib/domain/decimal";
import type { RowMessage } from "@/lib/csv/normalize";

import type { RuleCode } from "./rule-codes";

export { ENGINE_RULES, RULE_CODES, RULE_LABELS, type RuleCode } from "./rule-codes";

/** Bump when rule logic changes so analysis runs record which rules produced them. */
export const RULES_VERSION = "2026.10.1";

export interface Detection {
  ruleCode: RuleCode;
  category: IssueCategory;
  severity: IssueSeverity;
  propertyId: string;
  relatedPropertyId?: string | null;
  documentId?: string | null;
  field?: string | null;
  observedValue?: string | null;
  expectedValue?: string | null;
  explanation: string;
  recommendation: string;
}

export function fingerprintOf(d: Pick<Detection, "ruleCode" | "propertyId" | "field" | "relatedPropertyId" | "documentId">): string {
  return createHash("sha256")
    .update([d.ruleCode, d.propertyId, d.field ?? "", d.relatedPropertyId ?? "", d.documentId ?? ""].join("|"))
    .digest("hex");
}

/** The subset of a property the rules need. */
export interface PropertySnapshot {
  id: string;
  referenceCode: string | null;
  name: string | null;
  address: string | null;
  normalizedAddress: string | null;
  municipality: string | null;
  department: string | null;
  propertyType: PropertyType | null;
  rawPropertyType: string | null;
  cadastralId: string | null;
  landAreaM2: Decimal | null;
  buildingAreaM2: Decimal | null;
  askingPriceUsd: Decimal | null;
  pricePerM2Usd: Decimal | null;
  sourcePricePerM2: Decimal | null;
  verificationStatus: VerificationStatus | null;
  sourceUpdatedAt: Date | null;
  /** Parse warnings recorded when the property was imported. */
  importMessages: RowMessage[];
}
