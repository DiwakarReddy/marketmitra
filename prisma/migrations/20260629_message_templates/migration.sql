-- Add MessageTemplate model for multi-channel templates
-- Supports WhatsApp (free-form + Meta-approved), SMS, Email
-- with token substitution via the template engine in lib/templates.ts

CREATE TABLE "MessageTemplate" (
  "id"                TEXT PRIMARY KEY,
  "businessId"        TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "description"       TEXT,
  "channel"           TEXT NOT NULL,
  "category"          TEXT NOT NULL DEFAULT 'marketing',
  "body"              TEXT,
  "metaTemplateName"  TEXT,
  "smsBody"           TEXT,
  "emailSubject"      TEXT,
  "emailHtml"         TEXT,
  "emailText"         TEXT,
  "variables"         TEXT NOT NULL DEFAULT '[]',
  "metaTemplateConfig" TEXT,
  "timesUsed"         INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt"        TIMESTAMP,
  "status"            TEXT NOT NULL DEFAULT 'active',
  "createdAt"         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP NOT NULL,
  CONSTRAINT "MessageTemplate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
);

CREATE INDEX "MessageTemplate_businessId_idx"              ON "MessageTemplate" ("businessId");
CREATE INDEX "MessageTemplate_businessId_channel_idx"      ON "MessageTemplate" ("businessId", "channel");
CREATE INDEX "MessageTemplate_businessId_status_idx"       ON "MessageTemplate" ("businessId", "status");
CREATE INDEX "MessageTemplate_businessId_category_idx"     ON "MessageTemplate" ("businessId", "category");

-- DripStep gets a templateId reference
ALTER TABLE "DripStep" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
CREATE INDEX IF NOT EXISTS "DripStep_templateId_idx" ON "DripStep" ("templateId");
