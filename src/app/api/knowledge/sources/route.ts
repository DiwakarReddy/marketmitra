// /api/knowledge/sources
//   GET  : list all knowledge sources for current business
//   POST : create new source (manual / url / pdf / faq)
//          For 'manual'/'faq': pass { type, title, content }
//          For 'url': pass { type: 'url', title?, sourceUrl } — server crawls
//          For 'pdf': upload via /api/knowledge/sources/upload (multipart)
//
// Background: ingestion runs async via the cron worker or inline for small sources.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'
import { crawlUrl, ingestSource } from '@/lib/knowledge-base'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const sources = await prisma.knowledgeSource.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, type: true, title: true, sourceUrl: true,
      status: true, errorMessage: true, chunkCount: true,
      createdAt: true, updatedAt: true,
    },
  })
  return NextResponse.json({ sources })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'knowledgeIngest')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const body = await req.json()
  const { type, title, content, sourceUrl } = body

  if (!type || !['manual', 'url', 'faq', 'text'].includes(type)) {
    return NextResponse.json({ error: 'type must be manual|url|faq|text' }, { status: 400 })
  }

  let finalContent = ''
  let finalTitle = title || ''
  let finalUrl: string | null = null

  if (type === 'url') {
    if (!sourceUrl) return NextResponse.json({ error: 'sourceUrl required for url type' }, { status: 400 })
    try {
      const crawled = await crawlUrl(sourceUrl)
      finalContent = crawled.content
      finalTitle = title?.trim() || crawled.title
      finalUrl = sourceUrl
    } catch (err: any) {
      return NextResponse.json({ error: `Crawl failed: ${err.message}` }, { status: 400 })
    }
  } else {
    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'content required for manual/faq/text' }, { status: 400 })
    }
    if (!title?.trim()) {
      return NextResponse.json({ error: 'title required' }, { status: 400 })
    }
    finalContent = content
    finalTitle = title
  }

  if (finalContent.length > 5_000_000) {
    return NextResponse.json({ error: 'Content too large (max 5MB of text)' }, { status: 400 })
  }

  const source = await prisma.knowledgeSource.create({
    data: {
      businessId,
      type,
      title: finalTitle,
      content: finalContent,
      sourceUrl: finalUrl,
      status: 'processing',
    },
  })

  // Ingest in background (fire-and-forget but logged)
  ingestSource(source.id)
    .then((result) => {
      console.log(`[knowledge] source ${source.id} ingested: ${result.chunks} chunks via ${result.embeddingModel}`)
    })
    .catch((err) => {
      console.error(`[knowledge] ingest failed for ${source.id}:`, err)
      prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: 'failed', errorMessage: err.message },
      }).catch(() => null)
    })

  return NextResponse.json({ ok: true, sourceId: source.id, status: 'processing' })
}