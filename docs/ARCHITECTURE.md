# Architecture Proposal — AI Real Estate Data Analyzer (El Salvador)

Status: **Implemented.** This document began as the Phase 1 proposal; the notes below reflect the final implementation. See the README for setup and verification.

## 1. Repository findings

| Item | Finding | Impact |
|---|---|---|
| `client/` | Unmodified `create-next-app` scaffold: Next.js 16.4.2, React 19.3, Tailwind CSS 4 (Turbopack loader), ESLint 9, TypeScript 5 `strict: true`, `@/*` path alias | Use as the base. Nothing to preserve beyond config. |
| `next.config.ts` | `cacheComponents: true`, `partialPrefetching: true` | Data fetching is dynamic by default. Any uncached DB read must sit inside `<Suspense>` or the build fails. Cache Components forbids the `runtime` segment config. |
| `client/AGENTS.md` | Says to consult `node_modules/next/dist/docs/` before writing code (it's re-added by `next dev`) | Follow it. Keep the file. |
| `server/` | Empty directory | Not needed: Next.js route handlers and server actions cover the backend (see §2). |
| Git | `main` branch, no commits | No history constraints. |
| Toolchain | Node 22.22, npm 12, Docker 29 installed (**daemon not running**), no local PostgreSQL | Start Docker Desktop to use the Compose database. |

## 2. Proposed architecture

A **single Next.js application** (App Router) at the repository root (the scaffold was moved out of `client/`; the empty `server/` was removed), with the backend in the same codebase:

- **Server Components** read data through service functions (no client-side DB access).
- **Server Actions** handle small form mutations: create/edit property, issue review status.
- **Route Handlers** (`app/api/**`) handle file uploads (CSV, PDF), CSV exports (streamed `text/csv`), and the AI investigation endpoint.
- All server modules import `server-only`, so secrets and Prisma never reach the browser bundle.

A separate `server/` service would add deployment, CORS and type-sharing overhead without adding capability at this scale. The layering below keeps business logic framework-independent, so a separate API could be extracted later if needed.

```
<app root>/
├─ app/                         # Routes only: thin pages, layouts, route handlers
│  ├─ (app)/layout.tsx          # Sidebar shell
│  ├─ (app)/page.tsx            # Dashboard
│  ├─ (app)/properties/         # list, new, [id], [id]/edit
│  ├─ (app)/imports/            # history, new (upload → map → preview → commit), [id] summary
│  ├─ (app)/issues/             # Analysis results / issue management
│  ├─ (app)/compare/            # Side-by-side comparison of selected properties
│  ├─ (app)/market/             # Distributions, filtered stats, CSV export
│  ├─ (app)/investigate/        # AI investigation workspace
│  └─ api/                      # imports, documents, export/*, ai/*
├─ components/
│  ├─ ui/                       # Button, Card, Badge, Table, Field, Select, Dialog, EmptyState…
│  └─ <feature>/                # property-table, import-wizard, issue-list, charts…
├─ lib/
│  ├─ db.ts                     # Prisma client singleton (pg driver adapter)
│  ├─ domain/                   # enums, money/area math, units (m², v², mz), El Salvador geography reference
│  ├─ validation/               # Zod schemas for every external input
│  ├─ csv/                      # parse (papaparse), header auto-mapping, row normalization
│  ├─ quality/                  # rule engine: row rules (TS) + cross-record rules (SQL)
│  ├─ services/                 # property, import, issue, analysis, market (transactions live here)
│  ├─ ai/                       # LLM client interface, OpenAI impl, tool registry, prompts, citation check
│  └─ documents/                # PDF text extraction, field extraction, record comparison
├─ prisma/                      # schema.prisma, migrations/, seed.ts
├─ scripts/generate-sample-data.ts   # deterministic (seeded PRNG) synthetic dataset generator
├─ public/samples/              # downloadable synthetic CSVs + sample PDFs
├─ tests/                       # unit/ (no DB), integration/ (test DB)
├─ docker-compose.yml           # postgres (+ app service in Phase 7)
└─ prisma.config.ts, .env.example, README.md
```

### Dependencies (pinned to current stable releases)

| Purpose | Package | Notes |
|---|---|---|
| ORM | `prisma@7.10.1`, `@prisma/client@7.10.1`, `@prisma/adapter-pg`, `pg` | npm's `latest` tag currently points at `8.0.0-rc.24`. Pin the 7.10.1 stable instead. Prisma 7 uses the `prisma-client` generator, a driver adapter, and `prisma.config.ts`. |
| Validation | `zod@4` | Also used for OpenAI structured outputs. |
| CSV | `papaparse` | Handles quoting, BOM, delimiter detection. |
| PDF text | `unpdf` | pdf.js wrapper with per-page text (needed for page references). No OCR. |
| LLM | `openai` | Server-side only. The model is set by the `OPENAI_MODEL` env var. |
| Charts | `recharts` | Dashboard and market charts. |
| Dev | `tsx` (seed/scripts), `vitest` (one test runner for unit and integration) | No Jest, no extra assertion libraries. Playwright only if UI smoke tests prove necessary in Phase 7. |

## 3. Key design decisions

### 3.1 Preserve every record and flag issues; never silently merge
- Each imported row becomes its own `Property` record. Duplicate IDs and conflicting records are **kept and flagged**, never merged automatically.
- The raw source row is kept verbatim in `ImportRow.rawData`, giving full provenance (which file, which row, the original text values).
- Rows are only **rejected** when they can't be identified: completely empty, malformed (column-count mismatch), or missing both name and address. Every other row is **accepted**. Rows with at least one detected issue are **flagged**.

### 3.2 Deterministic quality engine (no LLM)

| # | Rule | Implementation | Default severity |
|---|---|---|---|
| 1 | Missing required fields (name, address, municipality, department, type, asking price, area) | TS row rule | high / medium |
| 2 | Duplicate property identifier | SQL `GROUP BY reference_code HAVING count > 1` | high |
| 3 | Potential duplicate property | SQL: same normalized address + municipality, **or** same cadastral ID, **or** `pg_trgm` similarity ≥ 0.8 within a municipality | medium |
| 4 | Missing/zero/negative/implausible area; building area > land area × plausible floors | TS row rule | high / medium |
| 5 | Invalid price; source price/m² inconsistent with price ÷ area (>2% delta) | TS row rule | high / medium |
| 6 | Department ↔ municipality mismatch / unknown municipality | TS rule against geography reference | medium |
| 7 | Conflicting values between records for the same property (same ref code or cadastral ID, differing price/area/type/location) | SQL candidate pairs + TS field diff | high |
| 8 | Missing documentation/verification status | TS row rule | low |
| 9 | Price/m² outlier **for review**: robust z-score on ln(price/m²) using median/MAD per property type within the municipality, falling back to the department when n < 5 (no country-wide fallback, since mixing markets flags normal regional differences) | SQL `percentile_cont` | low / medium. Always "requires human review", never "error". |
| 10 | Unsupported property classification | TS row rule | medium |
| 11 | Document ↔ record mismatch (Phase 6) | TS comparison of extracted fields | medium |

- Row rules are pure functions: unit-tested with no DB.
- Cross-record rules are SQL: integration-tested against a test database.
- **Idempotent re-runs:** each issue has a deterministic `fingerprint` (rule + property + field + related property). Re-running analysis:
  - updates `lastDetectedAt` on existing issues;
  - auto-resolves OPEN issues that are no longer detected (logged as a system review event);
  - reopens RESOLVED issues that reappear;
  - leaves DISMISSED issues dismissed, because the user decided they're acceptable (e.g. a legitimately unusual price).

### 3.3 Money and area
- Postgres `numeric` via Prisma `Decimal`: `Decimal(16,2)` for USD and `Decimal(14,2)` for m². All calculations use `Prisma.Decimal` with explicit rounding (half-up, 2 dp).
- Values are serialized as strings across the server→client boundary.
- `pricePerM2Usd` is **derived on every write** in one service function, and stored for SQL sorting/filtering and analytics. `pricePerM2Basis` records which area was used: building area for built property types, land area for commercial land.
- The import supports **m², varas cuadradas (v²) and manzanas**, which are common in Salvadoran listings: 1 v² = 0.698896 m², 1 mz = 10,000 v². Values are stored in m², and the raw value stays in `ImportRow`.
- Display currency is USD (`Intl.NumberFormat('en-US', { currency: 'USD' })`).
- The UI labels prices as **asking prices (listing data)**, never transaction prices or valuations.

### 3.4 AI investigation (grounded, no SQL from the model)
- **Tool calling against a fixed allow-list of server functions:**
  - `searchProperties`
  - `getPropertyDetails`
  - `listIssues`
  - `compareProperties`
  - `getMarketSummary`
  - `getDocumentFindings`

  Each tool has Zod-validated arguments, hard row limits and field whitelists. Tool rounds are capped (≤ 4) and the payload is truncated to a token budget. The model never sees connection details and can't run arbitrary queries.
- **Structured output:** `{ answer, findings[{ statement, basis: DATABASE_RECORD | USER_PROVIDED | DOCUMENT_EXTRACT | AI_INTERPRETATION, propertyIds[], fields[] }], limitations[] }`.
- **Server-side citation check:** every cited property ID must have appeared in this turn's tool results. Unknown IDs are stripped and the finding is marked as unsupported.
- **LLM boundary:** an `LlmClient` interface with an OpenAI implementation and a scripted fake for tests.
- **Failure handling:** timeout, retry with backoff on 429/5xx, and user-facing error states. If `OPENAI_API_KEY` is absent, AI panels show "not configured" and everything else keeps working.
- Every message stores the tool calls and retrieved record IDs (audit trail).

### 3.5 Documents (Phase 6)
- PDF only, ≤ 10 MB, checked by MIME type **and** `%PDF` magic bytes. Stored in Postgres (`bytea`) for MVP simplicity. Object storage is the documented upgrade path.
- Per-page text comes from `unpdf`. Scanned/image-only PDFs are detected (no text layer) and reported. There is no OCR.
- **Field extraction** is an LLM call with **no tools**: document text sits in delimited blocks and is declared untrusted data. The output schema includes `page` and `excerpt`. The server checks that each excerpt really appears on that page, and labels unverifiable excerpts.
- **Record comparison** is deterministic: extracted fields are compared against the property record, and mismatches become `DOCUMENT_MISMATCH` issues for human review.
- Documents are never described as officially verified.

### 3.6 Rendering with Cache Components
- Pages render a static shell (headings, filters). Data sections are async Server Components inside `<Suspense>` with skeleton fallbacks.
- Mutations call `revalidatePath`/`updateTag`.
- Selective `use cache` + `cacheTag` (e.g. dashboard aggregates) is applied only after it's correct uncached.

## 4. Database schema (draft)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../lib/generated/prisma"
}

datasource db {
  provider = "postgresql"   // URL supplied via prisma.config.ts (Prisma 7)
}

enum PropertyType       { COMMERCIAL_LAND RETAIL OFFICE WAREHOUSE_INDUSTRIAL SHOPPING_CENTER }
enum VerificationStatus { UNVERIFIED PENDING_REVIEW PARTIALLY_VERIFIED VERIFIED }   // user-attested, not official
enum RecordSource       { SEED CSV_IMPORT MANUAL }
enum AreaBasis          { LAND BUILDING }
enum ImportStatus       { PENDING_MAPPING COMPLETED FAILED }
enum ImportRowStatus    { ACCEPTED FLAGGED REJECTED }
enum IssueSeverity      { LOW MEDIUM HIGH }
enum IssueStatus        { OPEN RESOLVED DISMISSED }
enum IssueCategory      { COMPLETENESS DUPLICATION VALIDITY CONSISTENCY LOCATION VERIFICATION ANOMALY CLASSIFICATION DOCUMENT }
enum AnalysisTrigger    { IMPORT MANUAL PROPERTY_EDIT DOCUMENT }
enum RunStatus          { RUNNING COMPLETED FAILED }
enum DocumentStatus     { UPLOADED EXTRACTED ANALYZED FAILED }
enum MessageRole        { USER ASSISTANT }

model Property {
  id                 String              @id @default(cuid())
  referenceCode      String?             // user-facing "Property ID" from the source; intentionally NOT unique
  name               String?
  address            String?
  normalizedAddress  String?             // lowercase, accent-stripped, abbreviations expanded (matching only)
  municipality       String?
  department         String?
  propertyType       PropertyType?
  rawPropertyType    String?             // original label when unmapped/unsupported
  cadastralId        String?
  landAreaM2         Decimal?            @db.Decimal(14, 2)
  buildingAreaM2     Decimal?            @db.Decimal(14, 2)
  askingPriceUsd     Decimal?            @db.Decimal(16, 2)
  pricePerM2Usd      Decimal?            @db.Decimal(14, 2)   // derived
  pricePerM2Basis    AreaBasis?
  sourcePricePerM2   Decimal?            @db.Decimal(14, 2)   // as stated by the source, for consistency check
  description        String?
  zoning             String?             // free text, unverified
  verificationStatus VerificationStatus?
  source             RecordSource
  isSynthetic        Boolean             @default(false)
  sourceUpdatedAt    DateTime?           // "last updated" per the source
  importId           String?
  import             DataImport?         @relation(fields: [importId], references: [id], onDelete: Restrict)
  importRow          ImportRow?
  issues             DataQualityIssue[]  @relation("IssueProperty")
  relatedIssues      DataQualityIssue[]  @relation("IssueRelatedProperty")
  documents          PropertyDocument[]
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  @@index([referenceCode])
  @@index([cadastralId])
  @@index([municipality, department])
  @@index([propertyType])
  @@index([verificationStatus])
  @@index([normalizedAddress])        // + GIN trigram index added in raw migration SQL
}

model DataImport {
  id            String        @id @default(cuid())
  fileName      String
  fileSha256    String        // warn on re-import of an identical file
  fileContent   String        // original CSV text (≤ 5 MB) — provenance & re-processing
  delimiter     String
  headers       String[]
  columnMapping Json?         // { targetField: sourceHeader } + unit/decimal options
  status        ImportStatus
  totalRows     Int           @default(0)
  acceptedRows  Int           @default(0)
  flaggedRows   Int           @default(0)
  rejectedRows  Int           @default(0)
  errorMessage  String?
  rows          ImportRow[]
  properties    Property[]
  analysisRuns  AnalysisRun[]
  createdAt     DateTime      @default(now())
  completedAt   DateTime?

  @@index([createdAt])
  @@index([fileSha256])
}

model ImportRow {
  id         String          @id @default(cuid())
  importId   String
  import     DataImport      @relation(fields: [importId], references: [id], onDelete: Cascade)
  rowNumber  Int
  rawData    Json            // verbatim source values keyed by original header
  status     ImportRowStatus
  messages   Json            // rejection reasons / row-level warnings
  propertyId String?         @unique
  property   Property?       @relation(fields: [propertyId], references: [id], onDelete: SetNull)

  @@unique([importId, rowNumber])
  @@index([importId, status])
}

model AnalysisRun {
  id                 String           @id @default(cuid())
  trigger            AnalysisTrigger
  importId           String?
  import             DataImport?      @relation(fields: [importId], references: [id], onDelete: SetNull)
  rulesVersion       String
  status             RunStatus
  propertiesScanned  Int              @default(0)
  issuesDetected     Int              @default(0)
  issuesNew          Int              @default(0)
  issuesAutoResolved Int              @default(0)
  errorMessage       String?
  startedAt          DateTime         @default(now())
  finishedAt         DateTime?
  issues             DataQualityIssue[]

  @@index([startedAt])
}

model DataQualityIssue {
  id                String          @id @default(cuid())
  fingerprint       String          @unique   // sha256(rule|propertyId|field|relatedPropertyId)
  ruleCode          String          // e.g. DUPLICATE_IDENTIFIER, PRICE_PER_M2_OUTLIER
  category          IssueCategory
  severity          IssueSeverity
  propertyId        String
  property          Property        @relation("IssueProperty", fields: [propertyId], references: [id], onDelete: Restrict)
  relatedPropertyId String?
  relatedProperty   Property?       @relation("IssueRelatedProperty", fields: [relatedPropertyId], references: [id], onDelete: Restrict)
  documentId        String?
  document          PropertyDocument? @relation(fields: [documentId], references: [id], onDelete: SetNull)
  field             String?
  observedValue     String?
  expectedValue     String?
  explanation       String
  recommendation    String
  status            IssueStatus     @default(OPEN)
  firstRunId        String
  firstRun          AnalysisRun     @relation(fields: [firstRunId], references: [id], onDelete: Restrict)
  detectedAt        DateTime        @default(now())
  lastDetectedAt    DateTime        @default(now())
  reviewEvents      IssueReviewEvent[]

  @@index([status, severity])
  @@index([propertyId])
  @@index([ruleCode])
  @@index([category])
}

model IssueReviewEvent {        // audit trail for resolve / dismiss / reopen / auto-resolve
  id         String           @id @default(cuid())
  issueId    String
  issue      DataQualityIssue @relation(fields: [issueId], references: [id], onDelete: Cascade)
  fromStatus IssueStatus
  toStatus   IssueStatus
  note       String?
  actor      String           // "user" | "system" (no auth in MVP)
  createdAt  DateTime         @default(now())

  @@index([issueId, createdAt])
}

model PropertyDocument {
  id              String          @id @default(cuid())
  propertyId      String
  property        Property        @relation(fields: [propertyId], references: [id], onDelete: Restrict)
  fileName        String
  mimeType        String
  sizeBytes       Int
  sha256          String
  content         Bytes
  pageCount       Int?
  extractedPages  Json?           // [{ page, text }]
  extraction      Json?           // AI-extracted fields with page + excerpt + excerptVerified
  summary         String?
  status          DocumentStatus
  errorMessage    String?
  issues          DataQualityIssue[]
  createdAt       DateTime        @default(now())

  @@index([propertyId])
}

model AIConversation {
  id         String      @id @default(cuid())
  title      String
  context    Json?       // { propertyIds?, issueId?, documentId? } that seeded the conversation
  messages   AIMessage[]
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  @@index([updatedAt])
}

model AIMessage {
  id             String         @id @default(cuid())
  conversationId String
  conversation   AIConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           MessageRole
  content        String         // user question or assistant answer text
  structured     Json?          // findings / bases / limitations after citation check
  toolCalls      Json?          // audit: tool name, validated args, returned record IDs
  model          String?
  inputTokens    Int?
  outputTokens   Int?
  latencyMs      Int?
  errorCode      String?
  createdAt      DateTime       @default(now())

  @@index([conversationId, createdAt])
}
```

Deliberately **not** modeled:
- Lookup tables for departments and municipalities. A static, typed reference module is enough and is easier to test.
- Users/auth.
- A property revision history (the original values live in `ImportRow.rawData`).

Each of these can be added later without reshaping the core.

## 5. Synthetic data plan
- `scripts/generate-sample-data.ts` uses a seeded PRNG, so it's reproducible. It writes:
  - `public/samples/properties-portfolio.csv`: ~100 rows, English headers, m².
  - `public/samples/listados-corredor.csv`: ~15 rows, **Spanish headers, v² areas, comma-formatted prices**. Some rows overlap with the portfolio file to show column mapping and conflict detection.
- The two files spread these defects across rows:
  - duplicate IDs
  - near-duplicate addresses
  - missing values
  - area inconsistencies
  - conflicting records
  - missing verification status
  - a department/municipality mismatch (e.g. Santa Tecla under San Salvador)
  - unsupported types
  - price/m² outliers
- Every reference code is prefixed `SYN-`, and every record has `isSynthetic = true`. The UI shows a persistent "Synthetic demo data" badge.
- Property names are invented. Street names are generic/real avenues with **fictional numbering**, and real buildings or malls aren't named. Parcel IDs use an obviously fictional format.
- `prisma/seed.ts` loads the samples **through the real import service**, so the seed exercises the same pipeline users run.

## 6. Verification strategy
- **Unit (Vitest, no DB):**
  - CSV parsing and header auto-mapping
  - number/unit normalization
  - Decimal math
  - each row rule
  - geography reference
  - citation checker
  - AI orchestration with the fake LLM (tool loop, timeout, 429 handling)
  - PDF extraction against fixture PDFs
  - excerpt verification
- **Integration (Vitest + Docker Postgres test DB):**
  - import transaction rollback on failure
  - SQL duplicate, conflict and outlier rules
  - idempotent re-analysis
  - issue review transitions
- **Build gates:** `tsc --noEmit`, `eslint`, `next build`. The build also enforces the Cache Components rules.
- **Manual smoke checklist** in the README for critical UI flows. Playwright is added only if time allows in Phase 7.

## 7. Risks and open questions
1. **El Salvador municipal reform (effective May 2024).** The 262 former municipalities were consolidated into 44 municipalities, and the former ones became *distritos*. Listings still commonly use the old names (e.g. "Santa Tecla", "Antiguo Cuscatlán").
   - Proposal: treat the legacy names as *district/locality* values in the reference data, and accept the 44 new municipality names too.
   - Unknown values get the message "not found in the reference list — verify", not "invalid".
   - The reference list must be checked against the official law before it's relied on. I'll include only mappings I can source confidently.
2. **Number formats.** Salvadoran sources usually write `1,250,000.00`, but some use `1.250.000,00`. The import wizard gets an explicit decimal-separator option, so it doesn't have to guess.
3. **Docker daemon is not running.** Phase 2 verification (migrations, seed, integration tests) needs PostgreSQL, either through Docker Desktop or a local install.
4. **OpenAI model choice.** It's configurable via `OPENAI_MODEL`. The default will be confirmed against the current OpenAI docs in Phase 5.
