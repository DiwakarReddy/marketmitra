import { NextRequest, NextResponse } from 'next/server'
import { runDailyJobs } from '@/lib/jobs'

// Daily cron — call once per day at 9 AM
// Handles: dunning checks, weekly summaries, retention reports

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  // Vercel Cron sends user-agent with 'vercel-cron' string
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  const secret = process.env.CRON_SECRET
  if (secret && secret !== 'disabled') {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}` && !isVercelCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const before = Date.now()
  await runDailyJobs()
  const duration = Date.now() - before

  return NextResponse.json({ ok: true, durationMs: duration, ranAt: new Date().toISOString() })
}

export async function POST(req: NextRequest) {
  return GET(req)
}