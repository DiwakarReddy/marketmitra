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

          // 2FA gate: if business has 2FA enabled, require the code field.
          // Login page submits code in credentials.twoFactorCode.
          if (user.business?.twoFactorEnabled) {
            const code = (credentials as any).twoFactorCode
            if (!code) {
              console.log('[auth] 2FA required for:', credentials.email)
              // Throw with sentinel message so login page can detect it
              throw new Error('2FA_REQUIRED')
            }
            const secret = user.business.twoFactorSecret
            if (!secret) {
              console.log('[auth] 2FA enabled but no secret for:', credentials.email)
              throw new Error('2FA_MISCONFIGURED')
            }
            const { verifyTOTP } = await import('./totp')
            if (!verifyTOTP(String(code), secret)) {
              console.log('[auth] Invalid 2FA code for:', credentials.email)
              throw new Error('INVALID_2FA_CODE')
            }
            console.log('[auth] 2FA verified for:', credentials.email)
          }

          console.log('[auth] Login success:', credentials.email)
          return {
            id: user.id,
            email: user.email!,
            name: user.name,
            businessId: user.businessId,
            role: user.role,
            // Pass plan + 2FA status into the JWT so middleware/layouts
            // don't have to round-trip the DB on every request.
            plan: user.business?.plan || 'trial',
            twoFactorEnabled: user.business?.twoFactorEnabled || false,
            twoFactorSecret: user.business?.twoFactorSecret || null,
          }
        } catch (err: any) {
          // Re-throw if it's our 2FA sentinel error so the login page can detect it
          if (err?.message === '2FA_REQUIRED' || err?.message === 'INVALID_2FA_CODE' || err?.message === '2FA_MISCONFIGURED') {
            throw err
          }
          console.error('[auth] authorize() error:', err)
          // Return null on any other error - this triggers CredentialsSignin redirect,
          // NOT a 405 on /api/auth/error
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // On sign-in: set fields from the user object
      if (user) {
        ;(token as any).businessId = (user as any).businessId
        ;(token as any).role = (user as any).role
        ;(token as any).plan = (user as any).plan || 'trial'
        ;(token as any).twoFactorEnabled = !!(user as any).twoFactorEnabled
        ;(token as any).twoFactorSecret = (user as any).twoFactorSecret || null
        return token
      }

      // On session updates OR every ~5 minutes, refresh plan/twoFactorEnabled from DB.
      // This handles existing tokens that lack these fields AND propagates plan upgrades
      // without forcing users to log out and back in.
      const lastRefresh = (token as any)._planRefreshedAt || 0
      const stale = Date.now() - lastRefresh > 5 * 60 * 1000
      if ((trigger === 'update' || stale) && (token as any).businessId) {
        try {
          const business = await prisma.business.findUnique({
            where: { id: (token as any).businessId },
            select: { plan: true, twoFactorEnabled: true },
          })
          if (business) {
            ;(token as any).plan = business.plan || 'trial'
            ;(token as any).twoFactorEnabled = !!business.twoFactorEnabled
            ;(token as any)._planRefreshedAt = Date.now()
          }
        } catch (err) {
          // Silent — fall back to whatever was in the token
        }
      }
      return token
    },
    async session({ session, token }) {
      ;(session as any).businessId = (token as any).businessId
      ;(session as any).role = (token as any).role
      ;(session as any).plan = (token as any).plan || 'trial'
      ;(session as any).twoFactorEnabled = !!(token as any).twoFactorEnabled
      // Don't expose the secret in the client session
      return session
    },
  },
  // Improve error handling
  debug: process.env.NODE_ENV === 'development',
}

export const handlers = NextAuth(authOptions)