-- Migration: WhatsApp features pack 1
-- Adds: Custom Fields, Knowledge multi-source, Drip Sequences, CTWA Campaigns, Coexistence tracking
-- Generated: 2026-06-29
--
-- Run with: npx prisma migrate deploy  (production)
--       or: npx prisma db push         (dev)

-- ============================================================
-- CUSTOM FIELDS
-- ============================================================

CREATE TABLE "CustomField" (
  "id"        TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "options"   TEXT,
  "required"  BOOLEAN NOT NULL DEFAULT false,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "order"     INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL,
  CONSTRAINT "CustomField_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "CustomField_businessId_key_key" ON "CustomField"("businessId", "key");
CREATE INDEX "CustomField_businessId_active_idx" ON "CustomField"("businessId", "active");

CREATE TABLE "CustomerFieldValue" (
  "id"        TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "fieldId"   TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP NOT NULL,
  CONSTRAINT "CustomerFieldValue_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE,
  CONSTRAINT "CustomerFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "CustomerFieldValue_customerId_fieldId_key" ON "CustomerFieldValue"("customerId", "fieldId");
CREATE INDEX "CustomerFieldValue_fieldId_idx" ON "CustomerFieldValue"("fieldId");

-- ============================================================
-- KNOWLEDGE BASE MULTI-SOURCE
-- ============================================================

CREATE TABLE "KnowledgeSource" (
  "id"           TEXT PRIMARY KEY,
  "businessId"   TEXT NOT NULL,
  "type"         TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "content"      TEXT NOT NULL,
  "sourceUrl"    TEXT,
  "status"       TEXT NOT NULL DEFAULT 'ready',
  "errorMessage" TEXT,
  "metadata"     TEXT,
  "chunkCount"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP NOT NULL,
  CONSTRAINT "KnowledgeSource_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
);

CREATE INDEX "KnowledgeSource_businessId_idx" ON "KnowledgeSource"("businessId");
CREATE INDEX "KnowledgeSource_businessId_status_idx" ON "KnowledgeSource"("businessId", "status");
CREATE INDEX "KnowledgeSource_businessId_type_idx" ON "KnowledgeSource"("businessId", "type");

CREATE TABLE "KnowledgeChunk" (
  "id"        TEXT PRIMARY KEY,
  "sourceId"  TEXT NOT NULL,
  "content"   TEXT NOT NULL,
  "embedding" TEXT,
  "position"  INTEGER NOT NULL,
  CONSTRAINT "KnowledgeChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE
);

CREATE INDEX "KnowledgeChunk_sourceId_idx" ON "KnowledgeChunk"("sourceId");

-- ============================================================
-- DRIP SEQUENCES
-- ============================================================

CREATE TABLE "DripSequence" (
  "id"            TEXT PRIMARY KEY,
  "businessId"    TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "description"   TEXT,
  "trigger"       TEXT NOT NULL,
  "triggerConfig" TEXT,
  "status"        TEXT NOT NULL DEFAULT 'active',
  "createdAt"     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP NOT NULL,
  CONSTRAINT "DripSequence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
);

CREATE INDEX "DripSequence_businessId_idx" ON "DripSequence"("businessId");
CREATE INDEX "DripSequence_businessId_status_idx" ON "DripSequence"("businessId", "status");
CREATE INDEX "DripSequence_businessId_trigger_idx" ON "DripSequence"("businessId", "trigger");

CREATE TABLE "DripStep" (
  "id"              TEXT PRIMARY KEY,
  "sequenceId"      TEXT NOT NULL,
  "position"        INTEGER NOT NULL,
  "delayHours"      INTEGER NOT NULL DEFAULT 24,
  "channel"         TEXT NOT NULL DEFAULT 'whatsapp',
  "templateName"    TEXT,
  "templateLang"    TEXT,
  "templateParams"  TEXT,
  "messageBody"     TEXT,
  "createdAt"       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DripStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "DripSequence"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "DripStep_sequenceId_position_key" ON "DripStep"("sequenceId", "position");
CREATE INDEX "DripStep_sequenceId_idx" ON "DripStep"("sequenceId");

CREATE TABLE "DripEnrollment" (
  "id"          TEXT PRIMARY KEY,
  "sequenceId"  TEXT NOT NULL,
  "customerId"  TEXT NOT NULL,
  "businessId"  TEXT NOT NULL,
  "currentStep" INTEGER NOT NULL DEFAULT 0,
  "status"      TEXT NOT NULL DEFAULT 'active',
  "enrolledAt"  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextRunAt"   TIMESTAMP NOT NULL,
  "lastStepAt"  TIMESTAMP,
  "completedAt" TIMESTAMP,
  "stopReason"  TEXT,
  CONSTRAINT "DripEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "DripSequence"("id") ON DELETE CASCADE,
  CONSTRAINT "DripEnrollment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE,
  CONSTRAINT "DripEnrollment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "DripEnrollment_sequenceId_customerId_key" ON "DripEnrollment"("sequenceId", "customerId");
CREATE INDEX "DripEnrollment_businessId_status_nextRunAt_idx" ON "DripEnrollment"("businessId", "status", "nextRunAt");
CREATE INDEX "DripEnrollment_nextRunAt_idx" ON "DripEnrollment"("nextRunAt");
CREATE INDEX "DripEnrollment_customerId_idx" ON "DripEnrollment"("customerId");

CREATE TABLE "DripExecution" (
  "id"            TEXT PRIMARY KEY,
  "enrollmentId"  TEXT NOT NULL,
  "stepId"        TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'sent',
  "externalId"    TEXT,
  "error"         TEXT,
  "executedAt"    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DripExecution_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "DripEnrollment"("id") ON DELETE CASCADE
);

CREATE INDEX "DripExecution_enrollmentId_idx" ON "DripExecution"("enrollmentId");
CREATE INDEX "DripExecution_executedAt_idx" ON "DripExecution"("executedAt");

-- ============================================================
-- CTWA ADS
-- ============================================================

CREATE TABLE "CTWACampaign" (
  "id"                TEXT PRIMARY KEY,
  "businessId"        TEXT NOT NULL,
  "metaCampaignId"    TEXT,
  "metaAdSetId"       TEXT,
  "metaAdId"          TEXT,
  "metaCreativeId"    TEXT,
  "name"              TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'draft',
  "phoneNumber"       TEXT NOT NULL,
  "welcomeMessage"    TEXT,
  "adHeadline"        TEXT NOT NULL,
  "adBody"            TEXT NOT NULL,
  "adImageUrl"        TEXT,
  "adCta"             TEXT NOT NULL DEFAULT 'SEND_MESSAGE',
  "destinationUrl"    TEXT,
  "audience"          TEXT,
  "budgetDailyPaise"  INTEGER NOT NULL DEFAULT 0,
  "spentPaise"        INTEGER NOT NULL DEFAULT 0,
  "impressions"       INTEGER NOT NULL DEFAULT 0,
  "clicks"            INTEGER NOT NULL DEFAULT 0,
  "leads"             INTEGER NOT NULL DEFAULT 0,
  "lastSyncedAt"      TIMESTAMP,
  "createdAt"         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP NOT NULL,
  CONSTRAINT "CTWACampaign_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
);

CREATE INDEX "CTWACampaign_businessId_idx" ON "CTWACampaign"("businessId");
CREATE INDEX "CTWACampaign_businessId_status_idx" ON "CTWACampaign"("businessId", "status");
CREATE INDEX "CTWACampaign_metaCampaignId_idx" ON "CTWACampaign"("metaCampaignId");

-- ============================================================
-- COEXISTENCE
-- ============================================================

CREATE TABLE "CoexistenceStatus" (
  "id"            TEXT PRIMARY KEY,
  "businessId"    TEXT NOT NULL UNIQUE,
  "enabled"       BOOLEAN NOT NULL DEFAULT false,
  "whatsappPhone" TEXT NOT NULL,
  "appId"         TEXT,
  "wabaId"        TEXT,
  "verifiedAt"    TIMESTAMP,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP NOT NULL
);