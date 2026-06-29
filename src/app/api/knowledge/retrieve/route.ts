// /api/knowledge/retrieve
//   POST { query: string, topK?: number }
//   Returns top-K relevant chunks for the given query.
//   Used by the AI orchestrator to ground replies in the business's knowledge.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { retrieveKnowledge, formatKnowledgeContext } from '@/lib/knowledge-base'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const body = await req.json()
  const query = (body.query || '').toString()
  const topK = Math.min(10, Math.max(1, Number(body.topK) || 4))

  if (!query.trim()) return NextResponse.json({ chunks: [], context: '' })

  const chunks = await retrieveKnowledge(businessId, query, topK)
  return NextResponse.json({
    chunks: chunks.map((c) => ({ content: c.content, sourceTitle: c.sourceTitle, sourceId: c.sourceId, score: c.score })),
    context: formatKnowledgeContext(chunks),
  })
}