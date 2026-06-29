-- Performance indexes for high-traffic hot paths
-- Adds composite indexes to speed up:
--   1. Conversation inbox cursor pagination
--   2. Status-filtered conversation listings (tabs)
--   3. Unread badge counts
--   4. Message externalId lookups (status callbacks)
--   5. Failed message delivery lookups
-- Safe to run online (CONCURRENTLY where supported)

-- Conversation inbox — most-frequent query in the app
CREATE INDEX IF NOT EXISTS "Conversation_businessId_lastMessageAt_id_idx"
  ON "Conversation" ("businessId", "lastMessageAt" DESC, "id" DESC);

-- Conversation status filter + sort
CREATE INDEX IF NOT EXISTS "Conversation_businessId_status_lastMessageAt_idx"
  ON "Conversation" ("businessId", "status", "lastMessageAt" DESC);

-- Unread badge count (sidebar query)
CREATE INDEX IF NOT EXISTS "Conversation_businessId_unreadCount_idx"
  ON "Conversation" ("businessId", "unreadCount");

-- Message status callback lookup by externalId
CREATE INDEX IF NOT EXISTS "Message_externalId_conversationId_idx"
  ON "Message" ("externalId", "conversationId");

-- Failed-delivery dashboard
CREATE INDEX IF NOT EXISTS "Message_deliveryStatus_failedAt_idx"
  ON "Message" ("deliveryStatus", "failedAt");
