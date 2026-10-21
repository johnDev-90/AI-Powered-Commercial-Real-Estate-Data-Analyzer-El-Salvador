import { z } from "zod";
import { ISSUE_CATEGORIES, ISSUE_SEVERITIES, ISSUE_STATUSES } from "@/lib/domain/labels";
import { RULE_CODES } from "@/lib/quality/rule-codes";

export const issueListQuerySchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  severity: z.enum(ISSUE_SEVERITIES).optional().catch(undefined),
  category: z.enum(ISSUE_CATEGORIES).optional().catch(undefined),
  status: z.enum([...ISSUE_STATUSES, "ALL"]).default("OPEN").catch("OPEN"),
  rule: z.enum(RULE_CODES).optional().catch(undefined),
  municipality: z.string().trim().max(100).optional().catch(undefined),
  property: z.string().trim().max(60).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25).catch(25),
});

export type IssueListQuery = z.infer<typeof issueListQuerySchema>;

export const issueReviewSchema = z.object({
  issueId: z.string().min(1).max(60),
  status: z.enum(ISSUE_STATUSES),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : null)),
});
