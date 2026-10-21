-- Trigram similarity for potential-duplicate address matching.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('COMMERCIAL_LAND', 'RETAIL', 'OFFICE', 'WAREHOUSE_INDUSTRIAL', 'SHOPPING_CENTER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING_REVIEW', 'PARTIALLY_VERIFIED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('SEED', 'CSV_IMPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "AreaBasis" AS ENUM ('LAND', 'BUILDING');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING_MAPPING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('ACCEPTED', 'FLAGGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "IssueCategory" AS ENUM ('COMPLETENESS', 'DUPLICATION', 'VALIDITY', 'CONSISTENCY', 'LOCATION', 'VERIFICATION', 'ANOMALY', 'CLASSIFICATION', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "AnalysisTrigger" AS ENUM ('IMPORT', 'MANUAL', 'PROPERTY_EDIT', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'EXTRACTED', 'ANALYZED', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT,
    "name" TEXT,
    "address" TEXT,
    "normalizedAddress" TEXT,
    "municipality" TEXT,
    "department" TEXT,
    "propertyType" "PropertyType",
    "rawPropertyType" TEXT,
    "cadastralId" TEXT,
    "landAreaM2" DECIMAL(14,2),
    "buildingAreaM2" DECIMAL(14,2),
    "askingPriceUsd" DECIMAL(16,2),
    "pricePerM2Usd" DECIMAL(14,2),
    "pricePerM2Basis" "AreaBasis",
    "sourcePricePerM2" DECIMAL(14,2),
    "description" TEXT,
    "zoning" TEXT,
    "verificationStatus" "VerificationStatus",
    "source" "RecordSource" NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "sourceUpdatedAt" TIMESTAMP(3),
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "fileContent" TEXT NOT NULL,
    "delimiter" TEXT NOT NULL,
    "headers" TEXT[],
    "columnMapping" JSONB,
    "status" "ImportStatus" NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "acceptedRows" INTEGER NOT NULL DEFAULT 0,
    "flaggedRows" INTEGER NOT NULL DEFAULT 0,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DataImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "messages" JSONB NOT NULL,
    "propertyId" TEXT,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "trigger" "AnalysisTrigger" NOT NULL,
    "importId" TEXT,
    "rulesVersion" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "propertiesScanned" INTEGER NOT NULL DEFAULT 0,
    "issuesDetected" INTEGER NOT NULL DEFAULT 0,
    "issuesNew" INTEGER NOT NULL DEFAULT 0,
    "issuesReopened" INTEGER NOT NULL DEFAULT 0,
    "issuesAutoResolved" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataQualityIssue" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "category" "IssueCategory" NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "propertyId" TEXT NOT NULL,
    "relatedPropertyId" TEXT,
    "documentId" TEXT,
    "field" TEXT,
    "observedValue" TEXT,
    "expectedValue" TEXT,
    "explanation" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "firstRunId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataQualityIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueReviewEvent" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "fromStatus" "IssueStatus" NOT NULL,
    "toStatus" "IssueStatus" NOT NULL,
    "note" TEXT,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyDocument" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "pageCount" INTEGER,
    "extractedPages" JSONB,
    "extraction" JSONB,
    "summary" TEXT,
    "status" "DocumentStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedAt" TIMESTAMP(3),

    CONSTRAINT "PropertyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "toolCalls" JSONB,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Property_referenceCode_idx" ON "Property"("referenceCode");

-- CreateIndex
CREATE INDEX "Property_cadastralId_idx" ON "Property"("cadastralId");

-- CreateIndex
CREATE INDEX "Property_municipality_department_idx" ON "Property"("municipality", "department");

-- CreateIndex
CREATE INDEX "Property_propertyType_idx" ON "Property"("propertyType");

-- CreateIndex
CREATE INDEX "Property_verificationStatus_idx" ON "Property"("verificationStatus");

-- CreateIndex
CREATE INDEX "Property_normalizedAddress_idx" ON "Property"("normalizedAddress");

-- CreateIndex
CREATE INDEX "Property_importId_idx" ON "Property"("importId");

-- CreateIndex
CREATE INDEX "DataImport_createdAt_idx" ON "DataImport"("createdAt");

-- CreateIndex
CREATE INDEX "DataImport_fileSha256_idx" ON "DataImport"("fileSha256");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_propertyId_key" ON "ImportRow"("propertyId");

-- CreateIndex
CREATE INDEX "ImportRow_importId_status_idx" ON "ImportRow"("importId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_importId_rowNumber_key" ON "ImportRow"("importId", "rowNumber");

-- CreateIndex
CREATE INDEX "AnalysisRun_startedAt_idx" ON "AnalysisRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DataQualityIssue_fingerprint_key" ON "DataQualityIssue"("fingerprint");

-- CreateIndex
CREATE INDEX "DataQualityIssue_status_severity_idx" ON "DataQualityIssue"("status", "severity");

-- CreateIndex
CREATE INDEX "DataQualityIssue_propertyId_idx" ON "DataQualityIssue"("propertyId");

-- CreateIndex
CREATE INDEX "DataQualityIssue_relatedPropertyId_idx" ON "DataQualityIssue"("relatedPropertyId");

-- CreateIndex
CREATE INDEX "DataQualityIssue_ruleCode_idx" ON "DataQualityIssue"("ruleCode");

-- CreateIndex
CREATE INDEX "DataQualityIssue_category_idx" ON "DataQualityIssue"("category");

-- CreateIndex
CREATE INDEX "DataQualityIssue_documentId_idx" ON "DataQualityIssue"("documentId");

-- CreateIndex
CREATE INDEX "IssueReviewEvent_issueId_createdAt_idx" ON "IssueReviewEvent"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "PropertyDocument_propertyId_idx" ON "PropertyDocument"("propertyId");

-- CreateIndex
CREATE INDEX "AIConversation_updatedAt_idx" ON "AIConversation"("updatedAt");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_createdAt_idx" ON "AIMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_importId_fkey" FOREIGN KEY ("importId") REFERENCES "DataImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "DataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_importId_fkey" FOREIGN KEY ("importId") REFERENCES "DataImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityIssue" ADD CONSTRAINT "DataQualityIssue_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityIssue" ADD CONSTRAINT "DataQualityIssue_relatedPropertyId_fkey" FOREIGN KEY ("relatedPropertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityIssue" ADD CONSTRAINT "DataQualityIssue_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PropertyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityIssue" ADD CONSTRAINT "DataQualityIssue_firstRunId_fkey" FOREIGN KEY ("firstRunId") REFERENCES "AnalysisRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueReviewEvent" ADD CONSTRAINT "IssueReviewEvent_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "DataQualityIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDocument" ADD CONSTRAINT "PropertyDocument_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Trigram index for address similarity lookups.
CREATE INDEX "Property_normalizedAddress_trgm_idx" ON "Property" USING GIN ("normalizedAddress" gin_trgm_ops);
