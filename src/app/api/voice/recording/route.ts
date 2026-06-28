import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Twilio recording callback - saves recording URL

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const callSid = formData.get('CallSid') as string
  const recordingUrl = formData.get('RecordingUrl') as string

  await prisma.voiceCall.updateMany({
    where: { twilioCallSid: callSid },
    data: { recordingUrl },
  })

  return NextResponse.json({ ok: true })
}