import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

// NextAuth v4 returns a handler function. For App Router we re-export it as GET/POST.
// This is the v4-compatible pattern.

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }