-- Add payment tracking fields to Invoice for Razorpay
-- paymentLink, orderId, paymentId — needed for webhook matching and
-- proper receipt/status tracking.

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "razorpayOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "razorpayPaymentLinkId" TEXT,
  ADD COLUMN IF NOT EXISTS "razorpayPaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentLinkUrl" TEXT;

CREATE INDEX IF NOT EXISTS "Invoice_razorpayOrderId_idx"       ON "Invoice" ("razorpayOrderId");
CREATE INDEX IF NOT EXISTS "Invoice_razorpayPaymentLinkId_idx" ON "Invoice" ("razorpayPaymentLinkId");
CREATE INDEX IF NOT EXISTS "Invoice_razorpayPaymentId_idx"     ON "Invoice" ("razorpayPaymentId");
