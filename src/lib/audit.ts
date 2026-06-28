// Channel audit log helper
// Records every credential change for compliance & debugging

import { prisma } from '@/lib/db'

export type AuditAction =
  | 'created'
  | 'updated'
  | 'rotated'
  | 'deleted'
  | 'test_succeeded'
  | 'test_failed'
  | 'used'
  | 'rate_limited'
  | 'accessed'

interface AuditEntry {
  businessId: string
  channel: string
  action: AuditAction
  actor?: string          // 'owner' | 'admin' | 'system'
  actorEmail?: string
  ipAddress?: string
  userAgent?: string
  changes?: { added?: string[]; removed?: string[]; updated?: string[]; rotated?: boolean }
  testResult?: 'success' | 'failed'
  testError?: string
  metadata?: Record<string, any>
}

export async function audit(entry: AuditEntry) {
  try {
    await prisma.channelConfigAudit.create({
      data: {
        businessId: entry.businessId,
        channel: entry.channel,
        action: entry.action,
        actor: entry.actor || 'system',
        actorEmail: entry.actorEmail,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        changes: entry.changes ? JSON.stringify(entry.changes) : null,
        testResult: entry.testResult,
        testError: entry.testError,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      },
    })
  } catch (err) {
    console.error('[audit] Failed to write audit entry:', err)
    // Never fail the main operation because of audit failure
  }
}

// Extract request metadata for audit
export function getRequestMeta(req: Request) {
  return {
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
  }
}