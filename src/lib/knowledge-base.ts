// Knowledge base — multi-source ingestion, chunking, embedding, retrieval.
// Replaces the old Business.knowledge String? blob.
//
// Sources can be:
//   - 'manual'  : free-form text the user types in
//   - 'url'     : crawled from a website
//   - 'pdf'     : extracted from an uploaded PDF
//   - 'faq'     : Q&A pairs (split intelligently)
//
// Each source is chunked (paragraph-based, ~500 chars) and embedded using
// OpenAI's text-embedding-3-small (preferred) or Google Gemini's embedding-001.
// Embeddings are stored as JSON float arrays (KnowledgeChunk.embedding).
// Retrieval uses cosine similarity with a keyword-overlap fallback.

import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { prisma } from '@/lib/db'
// pdf-parse: handle both CJS and ESM imports gracefully.
// The library is CJS but consumers may import as default or namespace.
// In some Next.js versions, the namespace import returns a module with
// the function under .default; in others it's the function itself.
import * as pdfParseMod from 'pdf-parse'
const pdfParse: (buf: Buffer, opts?: any) => Promise<{ text: string; numpages: number }> =
  typeof pdfParseMod === 'function'
    ? pdfParseMod as any
    : (pdfParseMod as any).pdf || (pdfParseMod as any).default || pdfParseMod

const CHUNK_TARGET_CHARS = 500
const CHUNK_OVERLAP_CHARS = 60
const TOP_K = 4

export interface IngestionResult {
  chunks: number
  embeddingModel: string
  bytes: number
}

// ============================================================
// URL CRAWLER
// ============================================================

/**
 * Fetch a URL and extract readable text from HTML.
 * Strips scripts, styles, nav, footer, then collapses whitespace.
 * Caps at 200KB to avoid huge pages.
 */
export async function crawlUrl(url: string): Promise<{ title: string; content: string }> {
  // Validate URL
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error('Invalid URL') }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http(s) URLs allowed')
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'MarketMitra-Bot/1.0 (+https://marketmitra.com)' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    throw new Error(`Expected HTML, got ${contentType}`)
  }
  let html = await res.text()
  if (html.length > 200_000) html = html.slice(0, 200_000)

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
  const title = (ogTitleMatch?.[1] || titleMatch?.[1] || parsed.hostname).trim()

  // Strip noise
  let text = html
    // Remove scripts, styles, nav, footer, header, svg, iframe
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, ' ')
    // Replace block-level closers with newlines so paragraphs split
    .replace(/<\/(p|div|h[1-6]|li|tr|br|article|section)>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim()
  if (!text) throw new Error('Page produced no extractable text')
  if (text.length < 50) throw new Error('Page text too short — may be a JS-only site')

  return { title, content: text }
}

// ============================================================
// PDF EXTRACTION
// ============================================================

/**
 * Extract text from a PDF buffer. Returns up to 5MB of text.
 */
export async function extractPdf(buffer: Buffer): Promise<{ content: string; pageCount: number }> {
  if (buffer.length > 25 * 1024 * 1024) {
    throw new Error('PDF too large (max 25MB)')
  }
  const parsed = await pdfParse(buffer, { max: 200 }) // max 200 pages
  if (!parsed.text || parsed.text.trim().length < 20) {
    throw new Error('PDF contains no extractable text (may be image-only)')
  }
  return { content: parsed.text, pageCount: parsed.numpages }
}

// ============================================================
// CHUNKING
// ============================================================

/**
 * Split text into ~500-char chunks with overlap.
 * Tries to break on paragraph boundaries first, then sentences.
 */
export function chunkText(text: string, targetChars = CHUNK_TARGET_CHARS): string[] {
  if (!text || text.length === 0) return []
  if (text.length <= targetChars) return [text.trim()].filter(Boolean)

  const chunks: string[] = []
  // Split into paragraphs first
  const paragraphs = text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean)

  let buffer = ''
  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim())
    buffer = ''
  }

  for (const p of paragraphs) {
    // If a single paragraph is huge, hard-split it on sentences
    if (p.length > targetChars * 2) {
      flush()
      const sentences = p.split(/(?<=[.!?।])\s+/).filter(Boolean)
      let sBuffer = ''
      for (const s of sentences) {
        if ((sBuffer + ' ' + s).length > targetChars) {
          if (sBuffer) chunks.push(sBuffer.trim())
          sBuffer = s
        } else {
          sBuffer = sBuffer ? sBuffer + ' ' + s : s
        }
      }
      if (sBuffer) buffer = (buffer ? buffer + '\n\n' : '') + sBuffer
      continue
    }

    if ((buffer + '\n\n' + p).length > targetChars && buffer) {
      flush()
    }
    buffer = buffer ? buffer + '\n\n' + p : p
  }
  flush()

  // Add overlap from end of previous chunk to start of next
  if (chunks.length > 1 && CHUNK_OVERLAP_CHARS > 0) {
    const withOverlap: string[] = [chunks[0]]
    for (let i = 1; i < chunks.length; i++) {
      const tail = chunks[i - 1].slice(-CHUNK_OVERLAP_CHARS)
      withOverlap.push(tail + ' ' + chunks[i])
    }
    return withOverlap.filter(Boolean)
  }
  return chunks
}

// ============================================================
// EMBEDDINGS
// ============================================================

/**
 * Generate embedding for a text. Uses OpenAI (text-embedding-3-small, 1536d)
 * if available, else Google Gemini embedding-001 (768d).
 * Returns a JSON string of the float array.
 *
 * If no provider is configured, returns null and we fall back to keyword search.
 */
export async function embedText(text: string): Promise<{ json: string; model: string } | null> {
  const cleanText = text.replace(/\s+/g, ' ').trim().slice(0, 8000)
  if (!cleanText) return null

  // Prefer OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: cleanText,
      })
      const vec = res.data[0].embedding
      return { json: JSON.stringify(vec), model: 'openai-text-embedding-3-small' }
    } catch (err) {
      console.warn('[embed] OpenAI failed, falling back to Gemini:', err)
    }
  }

  if (process.env.GOOGLE_API_KEY) {
    try {
      const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
      const model = genai.getGenerativeModel({ model: 'embedding-001' })
      const res = await model.embedContent(cleanText)
      const vec = res.embedding.values
      return { json: JSON.stringify(vec), model: 'gemini-embedding-001' }
    } catch (err) {
      console.warn('[embed] Gemini failed:', err)
    }
  }

  return null
}

async function embedBatch(texts: string[]): Promise<(string | null)[]> {
  // Try batch with OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts.map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 8000)),
      })
      return res.data.map((d) => JSON.stringify(d.embedding))
    } catch (err) {
      console.warn('[embed:batch] OpenAI batch failed, falling back:', err)
    }
  }
  // Gemini doesn't have batch API, embed one-by-one
  if (process.env.GOOGLE_API_KEY) {
    const results: (string | null)[] = []
    for (const t of texts) {
      results.push((await embedText(t))?.json ?? null)
    }
    return results
  }
  return texts.map(() => null)
}

// ============================================================
// INGESTION
// ============================================================

/**
 * Ingest a knowledge source: chunk + embed + persist.
 * Replaces all existing chunks for this source.
 */
export async function ingestSource(sourceId: string): Promise<IngestionResult> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } })
  if (!source) throw new Error('Source not found')

  const chunks = chunkText(source.content)
  if (chunks.length === 0) {
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: 'ready', chunkCount: 0, errorMessage: null },
    })
    return { chunks: 0, embeddingModel: 'none', bytes: source.content.length }
  }

  let embeddingModel = 'none'
  const embeddings = await embedBatch(chunks)
  if (embeddings[0]) {
    embeddingModel = process.env.OPENAI_API_KEY ? 'openai-text-embedding-3-small' : 'gemini-embedding-001'
  }

  // Replace chunks atomically
  await prisma.$transaction([
    prisma.knowledgeChunk.deleteMany({ where: { sourceId } }),
    prisma.knowledgeChunk.createMany({
      data: chunks.map((content, i) => ({
        sourceId,
        content,
        embedding: embeddings[i] ?? null,
        position: i,
      })),
    }),
    prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: 'ready', chunkCount: chunks.length, errorMessage: null },
    }),
  ])

  return { chunks: chunks.length, embeddingModel, bytes: source.content.length }
}

// ============================================================
// RETRIEVAL
// ============================================================

interface RetrievedChunk {
  content: string
  score: number
  sourceTitle: string
  sourceId: string
}

/**
 * Retrieve top-K chunks relevant to a query.
 * Uses cosine similarity on embeddings when available;
 * falls back to keyword overlap scoring.
 */
export async function retrieveKnowledge(
  businessId: string,
  query: string,
  topK = TOP_K
): Promise<RetrievedChunk[]> {
  if (!query || !query.trim()) return []

  const sources = await prisma.knowledgeSource.findMany({
    where: { businessId, status: 'ready' },
    include: { chunks: true },
    orderBy: { createdAt: 'desc' },
  })

  if (sources.length === 0) return []

  // Try embedding-based retrieval
  const queryEmbed = await embedText(query)
  let scored: RetrievedChunk[] = []

  if (queryEmbed) {
    const queryVec = JSON.parse(queryEmbed.json) as number[]
    for (const src of sources) {
      for (const chunk of src.chunks) {
        if (!chunk.embedding) continue
        try {
          const vec = JSON.parse(chunk.embedding) as number[]
          if (vec.length !== queryVec.length) continue
          const score = cosineSim(queryVec, vec)
          if (score > 0.3) {
            scored.push({
              content: chunk.content,
              score,
              sourceTitle: src.title,
              sourceId: src.id,
            })
          }
        } catch {
          // skip malformed
        }
      }
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  // Keyword overlap fallback
  const queryTerms = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2)
  if (queryTerms.length === 0) return []

  for (const src of sources) {
    for (const chunk of src.chunks) {
      const lower = chunk.content.toLowerCase()
      const matches = queryTerms.filter((t) => lower.includes(t)).length
      if (matches > 0) {
        scored.push({
          content: chunk.content,
          score: matches / queryTerms.length,
          sourceTitle: src.title,
          sourceId: src.id,
        })
      }
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Format retrieved chunks into a context string for AI prompts.
 */
export function formatKnowledgeContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return ''
  const grouped = new Map<string, RetrievedChunk[]>()
  for (const c of chunks) {
    if (!grouped.has(c.sourceTitle)) grouped.set(c.sourceTitle, [])
    grouped.get(c.sourceTitle)!.push(c)
  }
  const lines: string[] = []
  for (const [title, list] of grouped) {
    lines.push(`--- From: ${title} ---`)
    for (const c of list) lines.push(c.content.trim())
    lines.push('')
  }
  return lines.join('\n')
}