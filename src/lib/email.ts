// Email notifications via Resend (https://resend.com)
// Free tier: 100 emails/day, 3,000/month
// Used for: daily summary email, booking confirmations, payment receipts

interface EmailParams {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
}

export async function sendEmail(params: EmailParams): Promise<{ success: boolean; messageId?: string; error?: string; mocked?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = params.from || process.env.EMAIL_FROM || 'MarketMitra <noreply@marketmitra.com>'

  if (!apiKey || apiKey === '') {
    console.log('[Email MOCK]', params.to, '←', params.subject)
    return { success: true, messageId: `mock_${Date.now()}`, mocked: true }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text || params.html.replace(/<[^>]+>/g, ''),
      }),
    })

    const data = await res.json()
    if (res.ok && data.id) {
      return { success: true, messageId: data.id }
    }
    return { success: false, error: data.message || `Resend returned ${res.status}` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Email send failed' }
  }
}

// Pre-built email templates

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
}): { subject: string; html: string } {
  const dateStr = data.startsAt.toLocaleString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  return {
    subject: `Booking confirmed — ${data.businessName}`,
    html: `
<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0f172a;">नमस्ते ${data.customerName}!</h2>
  <p style="color: #475569;">आपका appointment confirm हो गया है:</p>
  <div style="background: #f0fdfa; border-left: 4px solid #0f766e; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p style="margin: 4px 0;"><strong>${data.businessName}</strong></p>
    <p style="margin: 4px 0;">${data.service}</p>
    <p style="margin: 4px 0; color: #0f766e; font-weight: 600;">${dateStr}</p>
  </div>
  <p style="color: #475569;">हम आपको एक WhatsApp reminder भी भेजेंगे।</p>
</div>
    `.trim(),
  }
}