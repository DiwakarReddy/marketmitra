import { NextRequest, NextResponse } from 'next/server'
import { runScheduledJobs, runDailyJobs } from '@/lib/jobs'

// Cron tick endpoint — call this every minute from Vercel Cron,
// GitHub Actions, or any external scheduler.
//
// Vercel Cron config (vercel.json):
//   { "crons": [
//     { "path": "/api/cron/tick", "schedule": "* * * * *" },
//     { "path": "/api/cron/daily", "schedule": "0 9 * * *" }
//   ] }
//
// Local dev: visit this URL manually to test, or set CRON_SECRET=disabled to skip auth.

export async function GET(req: NextRequest) {
  // Auth: require CRON_SECRET header in production
  const secret = process.env.CRON_SECRET
  if (secret && secret !== 'disabled') {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const before = Date.now()
  await runScheduledJobs()
  const duration = Date.now() - before

  return NextResponse.json({ ok: true, durationMs: duration, ranAt: new Date().toISOString() })
}

export async function POST(req: NextRequest) {
  return GET(req)
}