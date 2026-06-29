// /api/knowledge/sources/[id]
//   GET    : fetch a single source (full content)
//   DELETE : delete a source (cascades chunks)
//   POST   : re-ingest a source (regenerate embeddings)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ingestSource } from '@/lib/knowledge-base'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const source = await prisma.knowledgeSource.findFirst({
    where: { id: params.id, businessId },
  })
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ source })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const existing = await prisma.knowledgeSource.findFirst({
    where: { id: params.id, businessId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.knowledgeSource.delete({ where: { id: existing.id } })
  await prisma.activity.create({
    data: {
      businessId, type: 'knowledge_source_deleted', actor: 'owner',
      title: `Knowledge source removed: ${existing.title}`,
      description: `${existing.type} source deleted`,
    },
  })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Re-ingest endpoint (POST because it has side effects, not REST-pure PATCH)
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const source = await prisma.knowledgeSource.findFirst({
    where: { id: params.id, businessId },
  })
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.knowledgeSource.update({
    where: { id: source.id },
    data: { status: 'processing', errorMessage: null },
  })

  // Fire-and-forget
  ingestSource(source.id)
    .then((result) => {
      console.log(`[knowledge] re-ingested ${source.id}: ${result.chunks} chunks`)
    })
    .catch((err) => {
      prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: 'failed', errorMessage: err.message },
      }).catch(() => null)
    })

  return NextResponse.json({ ok: true, status: 'processing' })
}