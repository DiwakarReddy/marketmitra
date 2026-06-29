// /api/coexistence/signup-url
// Returns the Meta Embedded Signup OAuth URL.
// Frontend uses this to render the "Launch Meta Embedded Signup" button.

import { NextResponse } from 'next/server'
import { generateEmbeddedSignupURL } from '@/lib/coexistence'

export async function GET() {
  const url = generateEmbeddedSignupURL()
  if (!url) {
    return NextResponse.json({
      url: null,
      message: 'Embedded Signup not configured. Set META_APP_ID and META_APP_CONFIG_ID env vars.',
    })
  }
  return NextResponse.json({ url })
}