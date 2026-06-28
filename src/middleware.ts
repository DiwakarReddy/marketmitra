import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    // Allow NextAuth's own auth routes through unchanged
    if (req.nextUrl.pathname.startsWith('/api/auth')) {
      return NextResponse.next()
    }
    return NextResponse.next()
  },
  {
    pages: { signIn: '/login' },
  }
)

// Only run middleware on the actual app routes — never on API/auth or static files.
// This is critical: withAuth wraps ALL requests by default, including /api/auth/*,
// which causes NextAuth's own endpoints to 405.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/inbox/:path*',
    '/campaigns/:path*',
    '/calendar/:path*',
    '/customers/:path*',
    '/leads/:path*',
    '/approvals/:path*',
    '/knowledge/:path*',
    '/widget/:path*',
    '/templates/:path*',
    '/failures/:path*',
    '/settings/:path*',
    '/billing/:path*',
    '/onboarding/:path*',
  ],
}