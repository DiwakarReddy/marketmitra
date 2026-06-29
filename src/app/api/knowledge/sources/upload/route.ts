// /api/knowledge/sources/upload
// Multipart upload for PDF knowledge sources.
// Field name: 'file'. Optional 'title' field overrides filename.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { extractPdf, ingestSource } from '@/lib/knowledge-base'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs' // pdf-parse needs Node, not Edge

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'knowledgeUpload')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const form = await req.formData()
  const file = form.get('file') as File | null
  const title = (form.get('title') as string | null)?.trim() || ''

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files supported' }, { status: 400 })
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  let extractResult: { content: string; pageCount: number }
  try {
    extractResult = await extractPdf(buffer)
  } catch (err: any) {
    return NextResponse.json({ error: `PDF extraction failed: ${err.message}` }, { status: 400 })
  }

  const finalTitle = title || file.name.replace(/\.pdf$/i, '')
  const source = await prisma.knowledgeSource.create({
    data: {
      businessId,
      type: 'pdf',
      title: finalTitle,
      content: extractResult.content,
      status: 'processing',
      metadata: JSON.stringify({
        originalFilename: file.name,
        bytes: file.size,
        pageCount: extractResult.pageCount,
      }),
    },
  })

  ingestSource(source.id)
    .then((result) => console.log(`[knowledge] PDF ingested: ${source.id} → ${result.chunks} chunks`))
    .catch((err) => {
      console.error(`[knowledge] PDF ingest failed: ${source.id}:`, err)
      prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: 'failed', errorMessage: err.message },
      }).catch(() => null)
    })

  return NextResponse.json({
    ok: true,
    sourceId: source.id,
    status: 'processing',
    pageCount: extractResult.pageCount,
    chars: extractResult.content.length,
  })
}