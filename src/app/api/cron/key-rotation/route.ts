// /api/cron/key-rotation
// Weekly key-rotation reminder + force-rotation notice for old credentials.
// Run once a week via Vercel Cron (or any external scheduler).
//
// Vercel config (vercel.json):
//   { "path": "/api/cron/key-rotation", "schedule": "0 9 * * 1" }

import { NextRequest, NextResponse } from 'next/server'
import { runKeyRotationCheck } from '@/lib/automation/key-rotation'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  // Auth: require CRON_SECRET header in production
  const secret = process.env.CRON_SECRET
  if (secret && secret !== 'disabled') {
    const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}` && !isVercelCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const before = Date.now()
    const result = await runKeyRotationCheck()
    const duration = Date.now() - before
    return NextResponse.json({ ok: true, durationMs: duration, ranAt: new Date().toISOString(), ...result })
  } catch (err: any) {
    console.error('[cron] key-rotation failed:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
