import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

// TwiML endpoint — Twilio calls this when the call is answered
// Returns XML that Twilio reads aloud to the customer

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const script = url.searchParams.get('script') || 'नमस्ते, मैं MarketMitra से बोल रही हूँ।'
  const customerName = url.searchParams.get('customerName') || 'Customer'

  // Build TwiML that speaks the opening line, then gathers speech
  const twiml = new twilio.twiml.VoiceResponse()

  twiml.say(
    {
      voice: 'Polly.Aditi', // Hindi voice
      language: 'hi-IN',
    },
    script
  )

  // Gather customer response
  const gather = twiml.gather({
    input: ['speech'],
    language: 'hi-IN',
    speechTimeout: 'auto',
    action: '/api/voice/respond',
    method: 'POST',
  })

  gather.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, 'क्या आप appointment book करना चाहेंगे? हाँ या ना बोलिए।')

  // If no response, leave a voicemail and end
  twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, 'कोई जवाब नहीं मिला। मैं बाद में callback करूँगी। धन्यवाद।')
  twiml.hangup()

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}