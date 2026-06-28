import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { prisma } from '@/lib/db'
import { generateAIReply } from '@/lib/ai'

// Called when customer speaks during a voice call
// AI generates a contextual response, speaks it back, continues conversation

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const speechResult = formData.get('SpeechResult') as string
  const callSid = formData.get('CallSid') as string
  const confidence = parseFloat((formData.get('Confidence') as string) || '0')

  const twiml = new twilio.twiml.VoiceResponse()

  // Find the call record
  const voiceCall = await prisma.voiceCall.findFirst({
    where: { twilioCallSid: callSid },
    include: { customer: true, business: { include: { services: true } } },
  })

  if (!voiceCall || confidence < 0.5) {
    twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, 'माफ़ कीजिए, आपकी आवाज़ सही से सुनाई नहीं दी।')
    twiml.hangup()
    return xml(twiml)
  }

  // Save transcript
  const transcript = (voiceCall.transcript || '') + `\n[Customer]: ${speechResult}`
  await prisma.voiceCall.update({
    where: { id: voiceCall.id },
    data: { transcript },
  })

  // AI decides next response based on what customer said
  const aiReply = await generateAIReply(
    {
      businessName: voiceCall.business.name,
      vertical: voiceCall.business.vertical,
      city: voiceCall.business.city,
      ownerName: voiceCall.business.ownerName,
      language: 'hinglish',
      services: voiceCall.business.services.map((s) => ({ name: s.name, durationMin: s.durationMin, pricePaise: s.pricePaise })),
      hours: [],
      customerName: voiceCall.customer.name,
      customerPhone: voiceCall.customer.phone,
      customerContext: `This is a PHONE CALL. Keep responses under 15 words. Be warm and direct. Goal: book appointment or get callback time.`,
    },
    [],
    speechResult
  )

  // Strip non-spoken characters
  const spokenReply = aiReply.replace(/[^\w\s,.!?।🙏]/g, '').substring(0, 200)

  // Detect outcome intent
  const lower = speechResult.toLowerCase()
  let outcome: string | null = null
  if (lower.includes('book') || lower.includes('हाँ') || lower.includes('yes') || lower.includes('करो') || lower.includes('kar do')) {
    outcome = 'booked'
  } else if (lower.includes('callback') || lower.includes('बाद') || lower.includes('later')) {
    outcome = 'callback'
  } else if (lower.includes('no') || lower.includes('ना') || lower.includes('not interested') || lower.includes('मत')) {
    outcome = 'not_interested'
  }

  if (outcome) {
    await prisma.voiceCall.update({
      where: { id: voiceCall.id },
      data: { outcome, endedAt: new Date(), aiSummary: `Customer intent: ${outcome}` },
    })

    if (outcome === 'booked') {
      twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, spokenReply)
      twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, 'बहुत अच्छा! मैं आपका appointment confirm कर रही हूँ। आपको जल्दी SMS आएगा। धन्यवाद!')
    } else if (outcome === 'callback') {
      twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, spokenReply)
      twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, 'ठीक है, मैं आपको बाद में callback करूँगी। धन्यवाद!')
    } else {
      twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, 'कोई बात नहीं। अगर कभी ज़रूरत हो तो ज़रूर call करिए। नमस्ते।')
    }
    twiml.hangup()
  } else {
    // Continue conversation
    twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, spokenReply)

    const gather = twiml.gather({
      input: ['speech'],
      language: 'hi-IN',
      speechTimeout: 'auto',
      action: '/api/voice/respond',
      method: 'POST',
      maxSpeechTime: 10,
    })
    gather.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, 'और कुछ जानना चाहेंगे?')

    // End if no more input
    twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, 'धन्यवाद आपके समय के लिए। नमस्ते।')
    twiml.hangup()
  }

  return xml(twiml)
}

function xml(twiml: twilio.twiml.VoiceResponse) {
  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}