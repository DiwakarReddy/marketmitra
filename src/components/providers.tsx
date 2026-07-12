'use client'

import { SessionProvider } from 'next-auth/react'
import type { ReactNode } from 'react'

/**
 * Thin client-side provider wrapper.
 *
 * `SessionProvider` populates the NextAuth context so client components can call
 * `useSession()` (e.g. sidebar sign-out, login/signup auto-redirect when already
 * signed in). Without this, those components would throw `useSession must be
 * wrapped in <SessionProvider>`.
 *
 * `refetchInterval` is set high so we don't hammer the session endpoint on
 * background tabs; the JWT is the source of truth, so we just need to notice
 * when the server-side cookie has been wiped (e.g. after a sign-out from
 * another tab).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={5 * 60}
      refetchOnWindowFocus={true}
    >
      {children}
    </SessionProvider>
  )
}
