import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Twilio status callback - updates call state

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const callSid = formData.get('CallSid') as string
  const callStatus = formData.get('CallStatus') as string
  const duration = formData.get('CallDuration') as string

  const statusMap: Record<string, string> = {
    initiated: 'initiated',
    ringing: 'ringing',
    'in-progress': 'in_progress',
    completed: 'completed',
    failed: 'failed',
    'no-answer': 'no_answer',
    busy: 'failed',
  }

  await prisma.voiceCall.updateMany({
    where: { twilioCallSid: callSid },
    data: {
      status: statusMap[callStatus] || callStatus,
      durationSec: duration ? parseInt(duration) : 0,
      endedAt: callStatus === 'completed' || callStatus === 'failed' ? new Date() : undefined,
    },
  })

  return NextResponse.json({ ok: true })
}