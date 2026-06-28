// Prisma client setup

// - Standard Prisma client by default (works with Vercel Postgres, Supabase, Railway, Neon pooled, etc.)

// - Neon serverless adapter ONLY when explicitly opted in via USE_NEON_ADAPTER=true

//

// Why: Vercel Postgres URLs end in .neon.tech but we want standard Prisma for those

// (the Neon adapter is for Edge runtime / advanced use cases).


import { PrismaClient } from '@prisma/client'


const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined }


function createPrismaClient(): PrismaClient {

  const dbUrl = process.env.DATABASE_URL || ''


  // Neon adapter is opt-in only — set USE_NEON_ADAPTER=true to enable

  // (Required for Edge runtime; not needed for Node runtime with pooled URL)

  const useNeonAdapter = process.env.USE_NEON_ADAPTER === 'true' ||

    process.env.USE_NEON_ADAPTER === '1'


  if (useNeonAdapter && process.env.NODE_ENV === 'production') {

    try {

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

    } catch (err) {

      console.error('[db] Failed to initialize Neon adapter, falling back to standard Prisma:', err)

      // Fall through to standard client

    }

  }


  // Standard Prisma client (default — works with all Postgres providers)

  return new PrismaClient({

    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],

  })

}


export const prisma = globalForPrisma.prisma ?? createPrismaClient()


if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma


export default prisma