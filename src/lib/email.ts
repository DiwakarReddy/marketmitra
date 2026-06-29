// Email channel — production-ready, multi-tenant.
//
// Providers supported:
//   - resend    : Best DX, recommended. Each business can use their own
//                 domain or the platform shared key with their own "from".
//   - ses       : AWS SES — cheaper at scale, requires AWS account per business.
//
// Multi-tenant: each business stores their own credentials in
// ChannelConfig (channel='email', provider in {resend, ses}). We resolve
// per-business creds via channel-resolver. If a business has no config,
// we fall back to platform env vars (RESEND_API_KEY for shared mode).
//
// Why Email in addition to WhatsApp?
//   - Formal records (invoices, receipts, contracts)
//   - Long-form content (newsletter, weekly summary, menu updates)
//   - Customers without WhatsApp (rare in India, common elsewhere)
//   - Compliance: invoices MUST go via email in many jurisdictions
//
// Template catalog — we ship built-in templates for common flows so
// callers don't have to write HTML. Custom HTML is always supported.

import { prisma } from '@/lib/db'

export type EmailProvider = 'resend' | 'ses'

export interface EmailParams {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string              // "Name <email@domain>" — falls back to defaults
  replyTo?: string
  /** Attachments: array of { filename, content (base64) } */
  attachments?: Array<{ filename: string; content: string }>
  /** Optional provider-specific tag for analytics (Resend) */
  tags?: Array<{ name: string; value: string }>
}

export interface EmailSendResult {
  success: boolean
  messageId?: string
  error?: string
  provider?: EmailProvider
  mocked?: boolean
}

// ============================================================
// CREDENTIAL RESOLUTION
// ============================================================

interface EmailCreds {
  provider: EmailProvider
  // Resend
  apiKey?: string
  // SES
  accessKeyId?: string
  secretAccessKey?: string
  region?: string
  // Shared
  fromAddress: string        // "Name <email@domain>"
  fromName?: string
}

export async function getEmailCreds(businessId?: string): Promise<EmailCreds | null> {
  const defaultFromAddress = 'MarketMitra <noreply@marketmitra.com>'

  if (businessId) {
    const { resolveChannel } = await import('./channel-resolver')
    const channel = await resolveChannel(businessId, 'email')
    if (channel) {
      const c = channel.credentials
      const cfg = channel.config
      const provider = (channel.provider as EmailProvider) || 'resend'
      const fromAddress = cfg.fromAddress || defaultFromAddress

      if (provider === 'resend' && c.apiKey) {
        return { provider, apiKey: c.apiKey, fromAddress, fromName: cfg.fromName }
      }
      if (provider === 'ses' && c.accessKeyId && c.secretAccessKey) {
        return {
          provider,
          accessKeyId: c.accessKeyId,
          secretAccessKey: c.secretAccessKey,
          region: cfg.region || 'ap-south-1',
          fromAddress,
          fromName: cfg.fromName,
        }
      }
    }
  }

  // Platform / founder-mode fallback
  if (process.env.RESEND_API_KEY) {
    return {
      provider: 'resend',
      apiKey: process.env.RESEND_API_KEY,
      fromAddress: process.env.EMAIL_FROM || defaultFromAddress,
    }
  }
  if (process.env.AWS_SES_ACCESS_KEY_ID && process.env.AWS_SES_SECRET_ACCESS_KEY) {
    return {
      provider: 'ses',
      accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY,
      region: process.env.AWS_SES_REGION || 'ap-south-1',
      fromAddress: process.env.EMAIL_FROM || defaultFromAddress,
    }
  }

  return null
}

// ============================================================
// MAIN ENTRY
// ============================================================

export async function sendEmail(
  params: EmailParams,
  context?: { businessId?: string }
): Promise<EmailSendResult> {
  const creds = await getEmailCreds(context?.businessId)
  const from = params.from || creds?.fromAddress || 'MarketMitra <noreply@marketmitra.com>'

  if (!creds) {
    console.log(`[Email MOCK] → ${Array.isArray(params.to) ? params.to.join(',') : params.to}: ${params.subject}`)
    return {
      success: true, mocked: true, provider: 'resend',
      messageId: `mock_${Date.now()}`,
    }
  }

  try {
    switch (creds.provider) {
      case 'resend':
        return await sendViaResend(creds, from, params)
      case 'ses':
        return await sendViaSES(creds, from, params)
      default:
        return { success: false, error: `Unknown email provider: ${creds.provider}` }
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Email send failed', provider: creds.provider }
  }
}

// ============================================================
// RESEND (https://resend.com/docs/api-reference/emails/send-email)
// ============================================================

async function sendViaResend(creds: EmailCreds, from: string, params: EmailParams): Promise<EmailSendResult> {
  if (!creds.apiKey) {
    return { success: false, error: 'Resend API key missing', provider: 'resend' }
  }

  const body: any = {
    from,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
    text: params.text || htmlToText(params.html),
  }
  if (params.replyTo) body.reply_to = params.replyTo
  if (params.attachments?.length) {
    body.attachments = params.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
    }))
  }
  if (params.tags?.length) body.tags = params.tags

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data: any = await res.json()
    if (res.ok && data.id) {
      return { success: true, messageId: data.id, provider: 'resend' }
    }
    return { success: false, error: data.message || `Resend returned ${res.status}`, provider: 'resend' }
  } catch (err: any) {
    return { success: false, error: err.message, provider: 'resend' }
  }
}

// ============================================================
// AWS SES (https://docs.aws.amazon.com/ses/latest/dg/send-email.html)
// Uses SES v2 API with SigV4 — we use the raw REST endpoint and compute
// the signature with the AWS SDK to keep this lib dependency-light.
//
// In production: import @aws-sdk/client-ses and use the SDK directly.
// Here we keep it simple with fetch + a tiny SigV4 implementation only
// when SES is configured. For most installs, the SES path is unused.
// ============================================================

async function sendViaSES(creds: EmailCreds, from: string, params: EmailParams): Promise<EmailSendResult> {
  if (!creds.accessKeyId || !creds.secretAccessKey) {
    return { success: false, error: 'AWS SES creds missing', provider: 'ses' }
  }
  // SES v2 SendEmail API
  const url = `https://email.${creds.region}.amazonaws.com/v2/email/outbound-emails`
  const body: any = {
    FromEmailAddress: from,
    Destination: { ToAddresses: Array.isArray(params.to) ? params.to : [params.to] },
    Content: {
      Simple: {
        Subject: { Data: params.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: params.html, Charset: 'UTF-8' },
          Text: params.text
            ? { Data: params.text, Charset: 'UTF-8' }
            : { Data: htmlToText(params.html), Charset: 'UTF-8' },
        },
      },
    },
  }
  if (params.replyTo) {
    body.ReplyToAddresses = [params.replyTo]
  }

  try {
    // Sign the request with AWS SigV4 — we use the AWS crypto module to
    // keep this lib self-contained.
    const { signRequest } = await import('./aws-sigv4')
    const signed = signRequest({
      method: 'POST',
      url,
      body: JSON.stringify(body),
      region: creds.region!,
      service: 'ses',
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    })

    const res = await fetch(signed.url, {
      method: 'POST',
      headers: signed.headers as any,
      body: signed.body,
    })
    if (res.ok) {
      const data: any = await res.json().catch(() => ({}))
      return { success: true, messageId: data.MessageId, provider: 'ses' }
    }
    const err = await res.text().catch(() => '')
    return { success: false, error: `SES ${res.status}: ${err.slice(0, 200)}`, provider: 'ses' }
  } catch (err: any) {
    return { success: false, error: err.message, provider: 'ses' }
  }
}

// ============================================================
// HELPERS
// ============================================================

/** Strip HTML tags to plain text. Good-enough approximation. */
export function htmlToText(html: string): string {
  if (!html) return ''
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

// ============================================================
// PRE-BUILT TEMPLATES (kept here so they're always available)
// ============================================================

/**
 * Daily summary email — sent to the business owner at end-of-day.
 * Composed from the same data we send to WhatsApp (jobs.ts:runDailySummaries)
 * but rendered as a structured email with the same numbers.
 */
export function dailySummaryEmail(data: {
  ownerName: string
  businessName: string
  date: string
  leads: number
  bookings: number
  conversations: number
  aiReplies: number
  revenue: number
  upcomingAppointments: { time: string; customer: string; service: string }[]
}): { subject: string; html: string } {
  const subject = `${data.businessName} — Daily Summary for ${data.date}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #0f766e, #14b8a6); padding: 32px; color: white;">
      <h1 style="margin: 0; font-size: 24px;">Good evening, ${data.ownerName}!</h1>
      <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">Here's how ${data.businessName} performed today</p>
    </div>
    <div style="padding: 32px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
        <div style="background: #f0fdfa; padding: 16px; border-radius: 8px;">
          <div style="font-size: 12px; color: #0f766e; text-transform: uppercase; font-weight: 600;">New Leads</div>
          <div style="font-size: 28px; font-weight: 700; color: #0f172a; margin-top: 4px;">${data.leads}</div>
        </div>
        <div style="background: #ecfdf5; padding: 16px; border-radius: 8px;">
          <div style="font-size: 12px; color: #047857; text-transform: uppercase; font-weight: 600;">Bookings</div>
          <div style="font-size: 28px; font-weight: 700; color: #0f172a; margin-top: 4px;">${data.bookings}</div>
        </div>
        <div style="background: #fff7ed; padding: 16px; border-radius: 8px;">
          <div style="font-size: 12px; color: #c2410c; text-transform: uppercase; font-weight: 600;">AI Replies</div>
          <div style="font-size: 28px; font-weight: 700; color: #0f172a; margin-top: 4px;">${data.aiReplies}</div>
        </div>
        <div style="background: linear-gradient(135deg, #0f766e, #14b8a6); padding: 16px; border-radius: 8px; color: white;">
          <div style="font-size: 12px; opacity: 0.9; text-transform: uppercase; font-weight: 600;">Revenue</div>
          <div style="font-size: 28px; font-weight: 700; margin-top: 4px;">₹${data.revenue.toLocaleString('en-IN')}</div>
        </div>
      </div>

      ${data.upcomingAppointments.length > 0 ? `
        <h3 style="margin: 0 0 12px; font-size: 16px; color: #0f172a;">Tomorrow's Appointments</h3>
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
          ${data.upcomingAppointments.map((a) => `
            <div style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; color: #0f172a;">${a.customer}</div>
                <div style="font-size: 13px; color: #64748b;">${a.service}</div>
              </div>
              <div style="font-weight: 600; color: #0f766e;">${a.time}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; text-align: center;">
        <p style="margin: 0; font-size: 13px; color: #475569;">AI is working 24/7. You just see the customers.</p>
        <a href="${process.env.APP_URL || 'http://localhost:3000'}/dashboard" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: #0f766e; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">View Full Dashboard →</a>
      </div>
    </div>
    <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0;">
      Sent by MarketMitra AI • ${data.date}
    </div>
  </div>
</body>
</html>
  `.trim()

  return { subject, html }
}

export function bookingConfirmationEmail(data: {
  customerName: string
  businessName: string
  service: string
  startsAt: Date
  notes?: string
  bookingLink?: string
}): { subject: string; html: string } {
  const dateStr = data.startsAt.toLocaleString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
  return {
    subject: `Booking confirmed — ${data.businessName}`,
    html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #0f766e, #14b8a6); padding: 32px; color: white;">
      <h1 style="margin: 0; font-size: 22px;">Booking Confirmed ✓</h1>
    </div>
    <div style="padding: 32px;">
      <p style="margin: 0 0 16px; color: #334155; font-size: 16px;">नमस्ते ${data.customerName},</p>
      <p style="margin: 0 0 24px; color: #475569;">आपका appointment confirm हो गया है:</p>
      <div style="background: #f0fdfa; border-left: 4px solid #0f766e; padding: 20px; border-radius: 8px; margin: 0 0 24px;">
        <div style="font-size: 14px; color: #0f766e; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">${data.businessName}</div>
        <div style="font-size: 18px; color: #0f172a; font-weight: 600; margin-bottom: 4px;">${data.service}</div>
        <div style="font-size: 16px; color: #0f766e; font-weight: 600;">📅 ${dateStr}</div>
        ${data.notes ? `<div style="margin-top: 12px; font-size: 14px; color: #64748b;">${data.notes}</div>` : ''}
      </div>
      ${data.bookingLink ? `<a href="${data.bookingLink}" style="display: inline-block; padding: 12px 24px; background: #0f766e; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">View booking</a>` : ''}
      <p style="margin: 24px 0 0; color: #64748b; font-size: 14px;">हम आपको एक WhatsApp reminder भी भेजेंगे।</p>
    </div>
    <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0;">
      Sent by ${data.businessName} via MarketMitra
    </div>
  </div>
</body></html>`.trim(),
  }
}

export function invoiceEmail(data: {
  customerName: string
  businessName: string
  amount: number
  currency?: string
  invoiceId: string
  items: Array<{ description: string; amount: number }>
  paymentLink: string
  dueDate?: Date
}): { subject: string; html: string } {
  const total = data.items.reduce((sum, i) => sum + i.amount, 0)
  const rows = data.items.map((i) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${i.description}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #0f172a; font-weight: 600;">${data.currency || 'INR'} ${(i.amount / 100).toFixed(2)}</td>
    </tr>
  `).join('')

  return {
    subject: `Invoice from ${data.businessName} — ${data.currency || 'INR'} ${(total / 100).toFixed(2)}`,
    html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, sans-serif; background: #f8fafc; padding: 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="padding: 32px;">
      <h1 style="margin: 0 0 8px; color: #0f172a; font-size: 24px;">Invoice from ${data.businessName}</h1>
      <p style="margin: 0 0 24px; color: #64748b; font-size: 14px;">Invoice #${data.invoiceId.slice(-8)}${data.dueDate ? ` • Due ${data.dueDate.toLocaleDateString('en-IN')}` : ''}</p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">${rows}</table>
      <div style="background: #f0fdfa; padding: 16px; border-radius: 8px; text-align: right; margin-bottom: 24px;">
        <div style="font-size: 14px; color: #64748b; text-transform: uppercase; font-weight: 600;">Total</div>
        <div style="font-size: 28px; color: #0f766e; font-weight: 700;">${data.currency || 'INR'} ${(total / 100).toFixed(2)}</div>
      </div>
      <a href="${data.paymentLink}" style="display: inline-block; padding: 14px 28px; background: #0f766e; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Pay invoice →</a>
    </div>
  </div>
</body></html>`.trim(),
  }
}
