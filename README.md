# AI Real Estate Data Analyzer — El Salvador

A full-stack web application for organizing commercial real estate records in El Salvador, detecting data quality problems with deterministic rules, comparing properties using **asking-price** data, and investigating findings with a grounded AI assistant.

> **All demo data is synthetic.** Property names, addresses, parcel identifiers, zoning and prices in the sample files are fictional and must not be treated as real-world information. Prices in the application are **asking (listing) prices**, never verified transaction prices or valuations.

**Stack:** Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) · Tailwind CSS 4 · PostgreSQL · Prisma 7 (pg driver adapter) · Zod 4 · OpenAI API · Recharts · Vitest.

---

## Features

| Area | What it does |
|---|---|
| **Dashboard** | Totals, open issues by severity/category, duplicate sets, missing/invalid values, records needing review, median/average asking price per m² **by property type**, recent imports and analysis runs. |
| **Properties** | Search (name, address, Property ID, cadastral ID), filters (municipality, department, type, verification, open issues), sorting, pagination, create/edit, detail page with provenance and the verbatim source row, CSV export. |
| **CSV import** | Upload → automatic column mapping (English **and Spanish** headers) → parsing options (period/comma decimals, **m² / varas cuadradas / manzanas**, date format) → atomic commit → accepted / flagged / rejected summary. |
| **Data quality engine** | 16 deterministic rules in TypeScript + SQL (no LLM): missing fields, unreadable values, invalid/inconsistent areas, invalid prices, stated vs computed price/m², department ↔ municipality checks, duplicate IDs, potential duplicates (`pg_trgm` address similarity), conflicting records, price/m² outliers (robust z-score, flagged for **review**, not as errors), unsupported types, invalid dates, document mismatches. |
| **Issue management** | Filter by severity, category, rule, status, municipality; side-by-side record comparison; original values; resolve / dismiss / reopen with notes; full audit trail; CSV export. |
| **Comparison & market** | Compare up to 6 properties (price, areas, price/m² with basis, gaps that limit comparability), distributions by type and municipality, completeness, CSV export. |
| **AI investigation** | Natural-language questions answered **only** from data fetched by whitelisted, Zod-validated, read-only tools. Structured answers label each finding (database record, detected issue, user-provided, document extract, AI interpretation), cite record IDs, and list limitations. A server-side citation check removes IDs that were not retrieved. |
| **Document analysis** | PDF upload → per-page text extraction → field extraction (AI without tools, or rule-based fallback) with page numbers and excerpts that are verified against the page text → comparison with the record → mismatches flagged for review. Prompt-injection text is detected and ignored. |

## Architecture

```
app/                      Routes: thin server pages (data inside <Suspense>), route handlers in app/api
components/               UI primitives (ui.tsx), charts, forms, client widgets
lib/
  db.ts                   Prisma client singleton (pg adapter, pooled), transactions
  domain/                 Labels, Decimal math, area units, address normalization, geography reference
  validation/             Zod schemas for forms, URL filters and API bodies
  csv/                    Parsing (papaparse), header mapping, row normalization, safe CSV export
  quality/                Rule engine: row rules (pure TS), cross-record rules (SQL), reconciliation
  services/               Business logic: imports, properties, issues, analytics, compare, documents, exports
  ai/                     LLM interface (OpenAI + test double), tools, investigation loop, answer schema
  documents/              PDF text extraction, field extraction, excerpt verification, record comparison
  actions.ts              Server Actions (forms)
prisma/                   schema.prisma, migrations, seed.ts
scripts/                  Synthetic data generator, embedded local Postgres
public/samples/           Downloadable synthetic CSVs and sample PDFs
tests/unit, tests/integration
```

Key decisions (details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)):

- **Keep every record and flag issues; never silently merge.** Each CSV row becomes a `Property` and its verbatim values are stored in `ImportRow.rawData`. Duplicates and conflicts are surfaced for human review.
- **Money and areas use `numeric`/`Decimal`** (no floating point). Price per m² is derived in one place, using land area for land and building area for built properties, with no mixing of the two.
- **Idempotent analysis.** Issues have deterministic fingerprints. Re-running refreshes them, auto-resolves those no longer detected, reopens resolved ones that reappear, and keeps dismissed ones dismissed. Every transition is logged.
- **The LLM never runs SQL.** It can only call seven read-only tools with validated arguments and row limits, in at most 4 rounds. Answers must match a strict JSON schema and are validated again with Zod.
- **Documents are untrusted.** The extraction call has no tools, the text is delimited and declared as data, embedded instructions are detected, and excerpts are checked against the page text.

### Data model

`Property`, `DataImport`, `ImportRow` (provenance), `AnalysisRun`, `DataQualityIssue`, `IssueReviewEvent` (audit), `PropertyDocument`, `AIConversation`, `AIMessage`. See [`prisma/schema.prisma`](prisma/schema.prisma).

---

## Getting started (local)

Requirements: **Node.js 22+** and a PostgreSQL database (any of the three options below).

```bash
git clone https://github.com/johnDev-90/AI-Powered-Commercial-Real-Estate-Data-Analyzer-El-Salvador.git
cd AI-Powered-Commercial-Real-Estate-Data-Analyzer-El-Salvador
npm install            # also runs `prisma generate`
cp .env.example .env   # then set DATABASE_URL (and optionally OPENAI_API_KEY)
```

### 1. Database

| Option | Command | `DATABASE_URL` |
|---|---|---|
| **Docker** (recommended) | `docker compose up -d` | `postgresql://postgres:postgres@localhost:5432/cre_analyzer` |
| **Embedded, zero-install** (PGlite) | `npm run db:local` (keep it running) | `postgresql://postgres:postgres@127.0.0.1:5433/postgres` and `DATABASE_POOL_MAX="1"` |
| Existing PostgreSQL 14+ | — | your connection string |

The database needs the `pg_trgm` extension. The first migration creates it, which is supported by Docker Postgres, Neon and most managed Postgres services.

### 2. Migrate and seed

```bash
npm run db:migrate      # prisma migrate deploy
npm run db:seed         # imports the synthetic samples through the real import pipeline
# npm run db:reset-demo # deletes ALL data and re-seeds
```

### 3. Run

```bash
npm run dev             # http://localhost:3000
```

On an empty database the dashboard also offers a **Load synthetic demo data** button.

### OpenAI (optional)

Set in `.env` (server-side only; never exposed to the browser):

```
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-5.4-mini"   # any chat model that supports tools + JSON schema output
OPENAI_TIMEOUT_MS="45000"
```

Without a key, AI panels show "not configured", and documents use rule-based extraction. Everything else works.

---

## Deploying to Vercel

1. **Import the GitHub repository** in Vercel (framework: Next.js; `vercel.json` sets the build command to `npm run vercel-build`).
2. **Add a database:** Project → Storage → *Create Database* → **Neon (Postgres)**, connected to Production and Preview. This sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (used for migrations) automatically.
3. **Optional:** add `OPENAI_API_KEY` (and `OPENAI_MODEL`) under Settings → Environment Variables.
4. **Deploy** (or Redeploy if the first build ran before the database was attached).

`vercel-build` runs `prisma generate` → `prisma migrate deploy` → **seed only if the database is empty** → `next build`. The first deployment therefore comes up with the synthetic dataset loaded. Uploads are limited to 4 MB to stay under Vercel's request body limit.

---

## Sample data

Generated deterministically by `npm run samples:generate` (seeded PRNG) into `public/samples/` and downloadable from the Imports page.

| File | Contents |
|---|---|
| `properties-portfolio.csv` | 101 rows · English headers · m² · `,` separated. San Salvador, Santa Tecla, Antiguo Cuscatlán, Soyapango, San Miguel, Santa Ana and others. |
| `listados-corredor.csv` | 15 rows · **Spanish headers** · areas in **v²** · `1.250.000,00` numbers · `;` separated. 5 rows share Property IDs with the portfolio: 2 identical after unit conversion, 3 with different prices. |
| `docs/SYN-SS-0001-property-summary.pdf` | 2 pages; land area differs from the record by 12%. |
| `docs/SYN-AC-0003-broker-sheet.pdf` | Contains a deliberate prompt-injection line to demonstrate safe handling. |

Intentional problems include duplicate IDs (exact and conflicting copies), a re-typed address of the same property, a shared cadastral ID, missing name/address/municipality/price/areas, `Consultar` as a price, zero/negative/6 m² areas, building ≫ land, a $950 price, wrong stated price/m², Santa Tecla and Antiguo Cuscatlán under San Salvador, "Merliot" as municipality, a misspelled department, missing or unrecognized verification status, "Residential" and "Hotel" types, price/m² outliers and a future date.

**CSV columns** recognized automatically (case/accent-insensitive; any can be mapped manually): Property ID / Código · Property name / Nombre · Address / Dirección · Municipality / Municipio · Department / Departamento · Property type / Tipo · Cadastral ID / Clave catastral · Land area / Área terreno · Building area / Área construcción · Asking price / Precio · Price per m² / Precio por v² · Description · Zoning / Uso de suelo · Verification status / Estado verificación · Last updated / Fecha actualización.

---

## Verification

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # 74 tests: unit + integration (in-process PostgreSQL via PGlite; no Docker or API key needed)
npm run build       # production build; also enforces Cache Components rules
```

The tests cover:
- **Unit:** CSV parsing, header mapping, number/date/unit parsing, normalization, every row rule, Decimal rounding, geography, reconciliation, citation checking, AI error mapping, PDF extraction, excerpt verification, injection detection, document comparison and CSV formula-injection escaping.
- **Integration (real migrations on PGlite):** import transaction rollback, double-commit protection, detection counts on the demo dataset, idempotent re-analysis, auto-resolve after edits, dismiss/reopen behavior, dashboard and comparison queries, AI tool validation, the tool-calling loop with a scripted LLM (citation stripping, round limit, malformed output, rate limit, timeout, not configured) and document analysis (rule-based and AI paths, injection handling).

Manual smoke checklist: load demo data → filter properties → open a property → edit and save (issues re-evaluate) → import `listados-corredor.csv` → review and resolve an issue → compare 3 properties → export CSVs → upload a sample PDF → ask the AI a question (with a key).

## Known limitations

- No authentication or multi-tenancy; review actions are recorded as `user`.
- The geography reference is complete for San Salvador, La Libertad, Santa Ana and San Miguel and partial for other departments. It accepts both the 2024 municipalities and the former municipalities (now districts) and should be checked against official sources. Unknown values are reported as "verify", not "invalid".
- Price/m² outliers use per-municipality (or per-department) groups of at least 5 listings of the same type. Small markets may not have enough data to be evaluated.
- PDFs must contain a text layer (no OCR). Files are stored in Postgres (`bytea`, ≤ 4 MB); use object storage for production volumes.
- Analysis runs synchronously over all records (fine for thousands of rows; move to a background job for much larger datasets).
- Property edits are not versioned; the original imported values are preserved in `ImportRow`.
- The AI was verified with a scripted test double; live behavior depends on the configured OpenAI model.
