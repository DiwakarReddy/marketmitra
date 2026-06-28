import NextAuth, { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'

export const authOptions: NextAuthOptions = {
  // Cast: PrismaAdapter types expect Prisma Client with specific shape; ours is compatible
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // Wrap everything in try/catch so exceptions return null (→ "CredentialsSignin" error)
        // instead of throwing (which causes 405 on /api/auth/error)
        try {
          if (!credentials?.email || !credentials?.password) {
            console.log('[auth] Missing credentials')
            return null
          }

          const user = await prisma.user.findUnique({
            where: { email: credentials.email.toLowerCase().trim() },
            include: { business: true },
          })

          if (!user) {
            console.log('[auth] User not found:', credentials.email)
            return null
          }

          if (!user.passwordHash) {
            console.log('[auth] User has no password hash:', credentials.email)
            return null
          }

          const valid = await bcrypt.compare(credentials.password, user.passwordHash)
          if (!valid) {
            console.log('[auth] Invalid password for:', credentials.email)
            return null
          }

          console.log('[auth] Login success:', credentials.email)
          return {
            id: user.id,
            email: user.email!,
            name: user.name,
            businessId: user.businessId,
            role: user.role,
          }
        } catch (err) {
          console.error('[auth] authorize() error:', err)
          // Return null on any error - this triggers CredentialsSignin redirect,
          // NOT a 405 on /api/auth/error
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        ;(token as any).businessId = (user as any).businessId
        ;(token as any).role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      ;(session as any).businessId = (token as any).businessId
      ;(session as any).role = (token as any).role
      return session
    },
  },
  // Improve error handling
  debug: process.env.NODE_ENV === 'development',
}

export const handlers = NextAuth(authOptions)