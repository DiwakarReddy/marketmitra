// GET /api/health - Liveness + readiness check
// Used by Vercel, BetterStack, and other uptime monitors
//
// Returns 200 with {status: 'healthy'} when everything is OK
// Returns 503 with {status: 'degraded', failures: [...]} when something is broken

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // Not edge — we need DB

interface CheckResult {
  name: string
  status: 'pass' | 'fail'
  duration: number
  error?: string
}

async function timed<T>(name: string, fn: () => Promise<T>): Promise<CheckResult> {
  const start = Date.now()
  try {
    await fn()
    return { name, status: 'pass', duration: Date.now() - start }
  } catch (err: any) {
    return { name, status: 'fail', duration: Date.now() - start, error: err.message }
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const isDeep = searchParams.get('deep') === 'true' || searchParams.get('deep') === '1'

  // Always check DB — minimum for the app to work
  const checks: CheckResult[] = [
    await timed('database', async () => {
      await prisma.$queryRaw`SELECT 1`
    }),
  ]

  // Optional deep checks (don't run on every request)
  if (isDeep) {
    checks.push(
      await timed('businesses_count', async () => {
        await prisma.business.count()
      }),
      await timed('recent_messages', async () => {
        await prisma.message.count({
          where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        })
      })
    )
  }

  const failed = checks.filter((c) => c.status === 'fail')
  const healthy = failed.length === 0

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
      environment: process.env.NODE_ENV,
      region: process.env.VERCEL_REGION,
      checks,
      failures: failed.map((f) => ({ name: f.name, error: f.error })),
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}