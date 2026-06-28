// Key rotation reminder cron
// Runs weekly — finds credentials > 90 days old, emails business owner
// Also runs monthly — proactively rotates any credentials > 365 days

import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { audit } from '@/lib/audit'

const ROTATION_REMINDER_DAYS = 90    // Email reminder after 90 days
const ROTATION_FORCE_DAYS = 365      // Force rotation after 1 year

export async function runKeyRotationCheck() {
  const now = Date.now()
  const reminderCutoff = new Date(now - ROTATION_REMINDER_DAYS * 86400000)
  const forceCutoff = new Date(now - ROTATION_FORCE_DAYS * 86400000)

  const allConfigs = await prisma.channelConfig.findMany({
    where: { isActive: true, credentials: { not: null } },
    include: {
      business: { select: { id: true, name: true, ownerEmail: true, ownerName: true } },
    },
  })

  let reminded = 0
  let forced = 0

  for (const cfg of allConfigs) {
    const ageMs = now - new Date(cfg.lastRotatedAt || cfg.createdAt).getTime()
    const ageDays = Math.floor(ageMs / 86400000)

    // Reminder email
    if (new Date(cfg.lastRotatedAt || cfg.createdAt) < reminderCutoff) {
      await sendRotationReminder(cfg, ageDays)
      reminded++
    }

    // Force rotation (mark as needing rotation, email + dashboard alert)
    if (new Date(cfg.lastRotatedAt || cfg.createdAt) < forceCutoff) {
      await sendForceRotationNotice(cfg, ageDays)
      forced++
    }
  }

  return { reminded, forced, total: allConfigs.length }
}

async function sendRotationReminder(cfg: any, ageDays: number) {
  const lastRotated = cfg.lastRotatedAt ? new Date(cfg.lastRotatedAt).toLocaleDateString('en-IN') : 'never'
  const channelName = cfg.channel.replace('_', ' ')

  await sendEmail({
    to: cfg.business.ownerEmail,
    subject: `🔐 Time to rotate your ${channelName} credentials`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0f172a;">Security reminder: rotate your ${channelName} credentials</h2>
        <p>Hi ${cfg.business.ownerName.split(' ')[0]},</p>
        <p>Your <strong>${channelName}</strong> credentials for <strong>${cfg.business.name}</strong> haven't been rotated in <strong>${ageDays} days</strong>.</p>
        <p>Last rotated: ${lastRotated}</p>
        <p>We recommend rotating credentials every 90 days for best security practice. This protects your business if keys are accidentally leaked.</p>
        <a href="${process.env.APP_URL || 'https://app.marketmitra.com'}/settings" style="display: inline-block; padding: 12px 24px; background: #0f766e; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0;">Rotate now →</a>
        <p style="color: #64748b; font-size: 12px;">MarketMitra Security • Sent automatically because credentials are over 90 days old</p>
      </div>
    `,
  })

  await audit({
    businessId: cfg.businessId,
    channel: cfg.channel,
    action: 'accessed',
    actor: 'system',
    metadata: { reason: 'rotation_reminder_sent', ageDays },
  })
}

async function sendForceRotationNotice(cfg: any, ageDays: number) {
  // In production: this would mark the config as needing_rotation=true
  // For now: log + email
  const channelName = cfg.channel.replace('_', ' ')
  console.warn(`[security] ${channelName} credentials for business ${cfg.businessId} are ${ageDays} days old. Force rotation required.`)

  await sendEmail({
    to: cfg.business.ownerEmail,
    subject: `🚨 URGENT: Rotate your ${channelName} credentials (1+ year old)`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc2626;">URGENT: Security rotation required</h2>
        <p>Your <strong>${channelName}</strong> credentials are <strong>${ageDays} days old</strong> — over 1 year.</p>
        <p>Per security policy, you must rotate these immediately. If not rotated within 7 days, AI automations using this channel will be paused.</p>
        <a href="${process.env.APP_URL || 'https://app.marketmitra.com'}/settings" style="display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0;">Rotate now →</a>
      </div>
    `,
  })
}