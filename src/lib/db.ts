// Prisma client setup
// - In serverless (Vercel + Neon), uses Neon adapter for HTTP/WebSocket pooling
// - In long-running Node (local dev with Postgres/SQLite), uses default Prisma client
//
// Why: Neon serverless driver uses HTTP+WebSocket and avoids the
// connection-per-invocation problem that crashes serverless functions when
// Postgres connections exceed pool limits.

import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined }

function createPrismaClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL || ''
  const isNeon = dbUrl.includes('neon.tech') ||
                 dbUrl.includes('neondatabase') ||
                 process.env.USE_NEON_ADAPTER === 'true'

  if (isNeon && process.env.NODE_ENV === 'production') {
    // Use Neon serverless driver — works in Vercel serverless
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaNeon } = require('@prisma/adapter-neon')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool, neonConfig } = require('@neondatabase/serverless')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ws = require('ws')
    neonConfig.webSocketConstructor = ws

    const pool = new Pool({ connectionString: dbUrl })
    const adapter = new PrismaNeon(pool)
    return new PrismaClient({
      adapter,
      log: ['error'],
    })
  }

  // Dev / non-Neon: standard Prisma client
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma