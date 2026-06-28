'use client'

import { useState } from 'react'
import { Calendar, Clock, CheckCircle2, Phone, User, X, Loader2 } from 'lucide-react'

interface Service {
  id: string
  name: string
  durationMin: number
  pricePaise: number
}

export function WidgetPreviewClient({
  businessId,
  businessName,
  businessCity,
  services,
}: {
  businessId: string
  businessName: string
  businessCity: string
  services: Service[]
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'service' | 'time' | 'details' | 'done'>('service')
  const [service, setService] = useState<Service | null>(null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setStep('service')
    setService(null)
    setDate('')
    setTime('')
    setName('')
    setPhone('')
    setError(null)
  }

  const submit = async () => {
    if (!service || !date || !time || !name || !phone) {
      setError('Please fill all fields')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // Build startsAt ISO from date+time
      const startsAt = new Date(`${date}T${time}:00`).toISOString()
      const res = await fetch('/api/widget/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          serviceId: service.id,
          name,
          phone,
          startsAt,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed')
      setStep('done')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Generate time slots for the selected date (10am-7pm, every 30 min)
  const slots: string[] = []
  for (let h = 10; h < 19; h++) {
    for (const m of [0, 30]) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink-100 via-white to-ink-50">
      {/* Mock website */}
      <header className="bg-white border-b border-ink-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center text-white font-bold">
              {businessName[0]}
            </div>
            <div>
              <div className="font-bold text-ink-900">{businessName}</div>
              <div className="text-xs text-ink-500">📍 {businessCity}</div>
            </div>
          </div>
          <nav className="hidden md:flex gap-6 text-sm text-ink-700">
            <a href="#services">Services</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        <section className="text-center py-12">
          <div className="inline-block px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-semibold mb-3">
            BOOK ONLINE · 24/7
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-ink-900 mb-3">
            Your smile, our passion.
          </h1>
          <p className="text-ink-600 max-w-xl mx-auto">
            Book your appointment in 30 seconds. No calls, no waiting — just pick a slot and you're set.
          </p>
        </section>

        <section id="services" className="grid md:grid-cols-3 gap-4">
          {services.length === 0 ? (
            <div className="col-span-3 p-6 bg-white rounded-xl border border-ink-200 text-center text-ink-500">
              No services configured yet. Add services in the Booking Widget page.
            </div>
          ) : (
            services.slice(0, 6).map((s) => (
              <div key={s.id} className="p-5 bg-white rounded-xl border border-ink-200">
                <div className="font-semibold text-ink-900 mb-1">{s.name}</div>
                <div className="text-sm text-ink-500 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  {s.durationMin} min
                  {s.pricePaise > 0 && <span>· ₹{(s.pricePaise / 100).toLocaleString('en-IN')}</span>}
                </div>
              </div>
            ))
          )}
        </section>

        <section id="about" className="bg-white rounded-xl border border-ink-200 p-8">
          <h2 className="text-2xl font-bold text-ink-900 mb-3">About {businessName}</h2>
          <p className="text-ink-600">
            Welcome to {businessName} in {businessCity}. Click the floating button at the bottom-right of this page to book your appointment online.
          </p>
        </section>
      </main>

      {/* Floating booking button */}
      <button
        onClick={() => { reset(); setOpen(true) }}
        className="fixed bottom-6 right-6 z-40 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-5 py-3 rounded-full shadow-xl flex items-center gap-2 transition transform hover:scale-105"
        aria-label="Book appointment"
      >
        <Calendar className="w-5 h-5" />
        Book Appointment
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-ink-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-ink-900">Book appointment</h3>
                <p className="text-xs text-ink-500 mt-0.5">Powered by MarketMitra</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-ink-500 hover:text-ink-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {step === 'service' && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-ink-700 mb-2">Select a service</p>
                  {services.length === 0 ? (
                    <div className="p-4 text-center text-sm text-ink-500 bg-ink-50 rounded-lg">
                      No services configured. Please contact {businessName} directly.
                    </div>
                  ) : (
                    services.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setService(s); setStep('time') }}
                        className="w-full text-left p-3 border-2 border-ink-200 hover:border-teal-500 rounded-lg flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium text-ink-900">{s.name}</div>
                          <div className="text-xs text-ink-500">{s.durationMin} min{s.pricePaise > 0 ? ` · ₹${(s.pricePaise / 100).toLocaleString('en-IN')}` : ''}</div>
                        </div>
                        <Calendar className="w-4 h-4 text-teal-600" />
                      </button>
                    ))
                  )}
                </div>
              )}

              {step === 'time' && (
                <div className="space-y-3">
                  <button onClick={() => setStep('service')} className="text-xs text-teal-700 hover:underline">
                    ← Change service
                  </button>
                  <div className="p-3 bg-teal-50 rounded-lg text-sm">
                    <span className="font-medium">{service?.name}</span>
                    <span className="text-ink-500 ml-2">{service?.durationMin} min</span>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink-700 block mb-1">Date</label>
                    <input
                      type="date"
                      className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm"
                      value={date}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  {date && (
                    <div>
                      <label className="text-xs font-medium text-ink-700 block mb-2">Available slots</label>
                      <div className="grid grid-cols-4 gap-2">
                        {slots.map((t) => (
                          <button
                            key={t}
                            onClick={() => { setTime(t); setStep('details') }}
                            className={`p-2 text-xs rounded-lg border ${
                              time === t ? 'bg-teal-600 text-white border-teal-600' : 'border-ink-200 hover:border-teal-500'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 'details' && (
                <div className="space-y-3">
                  <button onClick={() => setStep('time')} className="text-xs text-teal-700 hover:underline">
                    ← Change time
                  </button>
                  <div className="p-3 bg-teal-50 rounded-lg text-sm">
                    <div className="font-medium">{service?.name}</div>
                    <div className="text-ink-600 text-xs mt-0.5">
                      {date} at {time}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink-700 block mb-1 flex items-center gap-1">
                      <User className="w-3 h-3" /> Your name
                    </label>
                    <input
                      className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="रिया शर्मा"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink-700 block mb-1 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> WhatsApp number
                    </label>
                    <input
                      type="tel"
                      className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="98765 43210"
                    />
                  </div>
                  {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
                  <button
                    onClick={submit}
                    disabled={submitting || !name || !phone}
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {submitting ? 'Booking...' : 'Confirm booking'}
                  </button>
                </div>
              )}

              {step === 'done' && (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-3" />
                  <h4 className="text-xl font-bold text-ink-900 mb-2">Booking confirmed! 🎉</h4>
                  <p className="text-sm text-ink-600 mb-1">
                    {service?.name} on {date} at {time}
                  </p>
                  <p className="text-xs text-ink-500">
                    You'll receive a WhatsApp confirmation shortly.
                  </p>
                  <button
                    onClick={() => setOpen(false)}
                    className="mt-6 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}