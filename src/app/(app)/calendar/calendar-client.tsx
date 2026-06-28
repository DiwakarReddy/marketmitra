'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, List, AlertTriangle, CheckCircle2, X, Loader2, Filter } from 'lucide-react'

interface Appointment {
  id: string
  customerId: string
  serviceId: string | null
  startsAt: Date
  endsAt: Date
  status: string
  source: string
  notes: string | null
  customer: { id: string; name: string; phone: string }
  service: { id: string; name: string; durationMin: number; pricePaise: number } | null
}

interface Service {
  id: string
  name: string
  durationMin: number
  pricePaise: number
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  booked: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  completed: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  cancelled: { bg: 'bg-ink-100', text: 'text-ink-600', border: 'border-ink-300' },
  no_show: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  pending_confirmation: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
}

const SERVICE_COLORS = [
  { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300' },
  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
  { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-300' },
]

export function CalendarClient({ initialAppointments, services }: { initialAppointments: Appointment[]; services: Service[] }) {
  const { toast } = useToast()
  const [appointments, setAppointments] = useState(initialAppointments)
  const [view, setView] = useState<'day' | 'week' | 'list'>('day')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [colorBy, setColorBy] = useState<'status' | 'service'>('status')
  const [serviceFilter, setServiceFilter] = useState<string | null>(null)
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [creating, setCreating] = useState<Date | null>(null)
  const [draggedAppt, setDraggedAppt] = useState<Appointment | null>(null)

  const serviceColorMap = useMemo(() => {
    const map: Record<string, typeof SERVICE_COLORS[0]> = {}
    services.forEach((s, i) => {
      map[s.id] = SERVICE_COLORS[i % SERVICE_COLORS.length]
    })
    return map
  }, [services])

  // Date helpers
  const startOfDay = (d: Date) => {
    const r = new Date(d)
    r.setHours(0, 0, 0, 0)
    return r
  }
  const endOfDay = (d: Date) => {
    const r = new Date(d)
    r.setHours(23, 59, 59, 999)
    return r
  }
  const startOfWeek = (d: Date) => {
    const r = startOfDay(d)
    const day = r.getDay()
    r.setDate(r.getDate() - day)
    return r
  }

  const filtered = useMemo(() => {
    return appointments.filter((a) => {
      if (serviceFilter && a.serviceId !== serviceFilter) return false
      return true
    })
  }, [appointments, serviceFilter])

  const dayAppointments = filtered.filter((a) => {
    const start = new Date(a.startsAt)
    return start >= startOfDay(currentDate) && start <= endOfDay(currentDate)
  }).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

  const weekAppointments = filtered.filter((a) => {
    const start = new Date(a.startsAt)
    return start >= startOfWeek(currentDate) && start <= endOfDay(new Date(startOfWeek(currentDate).getTime() + 6 * 86400000))
  })

  const today = startOfDay(new Date())
  const isToday = startOfDay(currentDate).getTime() === today.getTime()

  // Generate hours for day view
  const hours = Array.from({ length: 13 }, (_, i) => i + 9) // 9 AM to 9 PM

  // Generate days for week view
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek(currentDate))
    d.setDate(d.getDate() + i)
    return d
  })

  // Reschedule via drag-drop
  const onDrop = async (newTime: Date) => {
    if (!draggedAppt) return
    const duration = new Date(draggedAppt.endsAt).getTime() - new Date(draggedAppt.startsAt).getTime()
    const newEnd = new Date(newTime.getTime() + duration)
    try {
      const res = await fetch(`/api/appointments/${draggedAppt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startsAt: newTime.toISOString(), endsAt: newEnd.toISOString() }),
      })
      if (!res.ok) throw new Error('Failed to reschedule')
      // Update locally
      setAppointments(appointments.map((a) =>
        a.id === draggedAppt.id ? { ...a, startsAt: newTime, endsAt: newEnd } : a
      ))
      toast({ title: 'Appointment rescheduled', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Could not reschedule', description: err.message, variant: 'error' })
    }
    setDraggedAppt(null)
  }

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setAppointments(appointments.map((a) => a.id === id ? { ...a, status } : a))
      toast({ title: `Status: ${status}`, variant: 'success' })
    }
  }

  const getApptColor = (a: Appointment) => {
    if (colorBy === 'service' && a.serviceId && serviceColorMap[a.serviceId]) {
      return serviceColorMap[a.serviceId]
    }
    return STATUS_COLORS[a.status] || STATUS_COLORS.booked
  }

  const printCalendar = () => {
    window.print()
  }

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">Calendar</h1>
          <p className="text-ink-600 mt-1">
            {isToday ? "Today's" : ''} appointments • {dayAppointments.length} bookings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-ink-200 rounded-lg overflow-hidden">
            {[
              { k: 'day', label: 'Day' },
              { k: 'week', label: 'Week' },
              { k: 'list', label: 'List' },
            ].map((v) => (
              <button
                key={v.k}
                onClick={() => setView(v.k as any)}
                className={`px-3 py-1.5 text-xs font-medium ${
                  view === v.k ? 'bg-teal-600 text-white' : 'bg-white text-ink-700 hover:bg-ink-50'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={printCalendar}>Print</Button>
          <Button variant="brand" size="sm" onClick={() => setCreating(new Date())}>
            <Plus className="w-4 h-4" />New
          </Button>
        </div>
      </div>

      {/* Date nav + filters */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => {
              const d = new Date(currentDate)
              if (view === 'week') d.setDate(d.getDate() - 7)
              else d.setDate(d.getDate() - 1)
              setCurrentDate(d)
            }}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>Today</Button>
            <Button variant="ghost" size="icon" onClick={() => {
              const d = new Date(currentDate)
              if (view === 'week') d.setDate(d.getDate() + 7)
              else d.setDate(d.getDate() + 1)
              setCurrentDate(d)
            }}><ChevronRight className="w-4 h-4" /></Button>
            <div className="font-semibold text-ink-900 ml-2">
              {view === 'day'
                ? currentDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                : `${weekDays[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${weekDays[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
              }
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-lg border border-ink-200 px-2 text-xs bg-white"
              value={colorBy}
              onChange={(e) => setColorBy(e.target.value as any)}
            >
              <option value="status">Color by status</option>
              <option value="service">Color by service</option>
            </select>
            <select
              className="h-8 rounded-lg border border-ink-200 px-2 text-xs bg-white"
              value={serviceFilter || ''}
              onChange={(e) => setServiceFilter(e.target.value || null)}
            >
              <option value="">All services</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Day view */}
      {view === 'day' && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-ink-100">
              {hours.map((hour) => {
                const slotAppts = dayAppointments.filter((a) => new Date(a.startsAt).getHours() === hour)
                return (
                  <div
                    key={hour}
                    className="flex min-h-[80px] hover:bg-ink-50/30"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      const t = new Date(currentDate)
                      t.setHours(hour, 0, 0, 0)
                      onDrop(t)
                    }}
                  >
                    <div className="w-20 p-3 text-xs text-ink-500 font-medium border-r border-ink-100">
                      {hour}:00 {hour < 12 ? 'AM' : 'PM'}
                    </div>
                    <div className="flex-1 p-2 space-y-1">
                      {slotAppts.map((a) => {
                        const c = getApptColor(a)
                        const time = new Date(a.startsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
                        return (
                          <div
                            key={a.id}
                            draggable
                            onDragStart={() => setDraggedAppt(a)}
                            onClick={() => setEditing(a)}
                            className={`${c.bg} ${c.text} border-l-4 ${c.border} rounded p-2 cursor-pointer hover:shadow-sm transition`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-sm">{a.customer.name}</div>
                              <div className="text-xs">{time}</div>
                            </div>
                            <div className="text-xs opacity-80">
                              {a.service?.name || 'No service'} • {a.source}
                            </div>
                            {a.status === 'no_show' && <AlertTriangle className="w-3 h-3 inline mt-1" />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Week view */}
      {view === 'week' && (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b border-ink-100">
              {weekDays.map((d) => {
                const isThisDay = d.getTime() === today.getTime()
                return (
                  <div key={d.toISOString()} className={`p-3 text-center border-r border-ink-100 last:border-r-0 ${isThisDay ? 'bg-teal-50' : ''}`}>
                    <div className="text-xs text-ink-500 uppercase">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                    <div className={`text-lg font-bold ${isThisDay ? 'text-teal-700' : 'text-ink-900'}`}>{d.getDate()}</div>
                  </div>
                )
              })}
            </div>
            <div className="grid grid-cols-7 min-h-[600px]">
              {weekDays.map((d) => {
                const dayAppts = weekAppointments.filter((a) => {
                  const s = new Date(a.startsAt)
                  return s.getDate() === d.getDate() && s.getMonth() === d.getMonth()
                })
                return (
                  <div
                    key={d.toISOString()}
                    className="border-r border-ink-100 last:border-r-0 p-2 space-y-1"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      const t = new Date(d)
                      t.setHours(10, 0, 0, 0)
                      onDrop(t)
                    }}
                  >
                    {dayAppts.map((a) => {
                      const c = getApptColor(a)
                      const time = new Date(a.startsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
                      return (
                        <div
                          key={a.id}
                          draggable
                          onDragStart={() => setDraggedAppt(a)}
                          onClick={() => setEditing(a)}
                          className={`${c.bg} ${c.text} border-l-4 ${c.border} rounded p-1.5 text-xs cursor-pointer`}
                        >
                          <div className="font-semibold truncate">{a.customer.name}</div>
                          <div className="opacity-80">{time}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* List view */}
      {view === 'list' && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-ink-100">
              {filtered.length === 0 ? (
                <div className="p-12 text-center text-ink-500">No appointments</div>
              ) : (
                filtered.map((a) => {
                  const c = getApptColor(a)
                  return (
                    <div key={a.id} className="p-3 flex items-center gap-3 hover:bg-ink-50/50 cursor-pointer" onClick={() => setEditing(a)}>
                      <div className={`${c.bg} ${c.text} border-l-4 ${c.border} rounded p-2 text-center min-w-[80px]`}>
                        <div className="text-xs">{new Date(a.startsAt).toLocaleDateString('en-IN', { month: 'short' })}</div>
                        <div className="text-lg font-bold leading-tight">{new Date(a.startsAt).getDate()}</div>
                        <div className="text-[10px]">{new Date(a.startsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-ink-900">{a.customer.name}</div>
                        <div className="text-xs text-ink-500">{a.service?.name || 'No service'} • {a.source}</div>
                      </div>
                      <Badge>{a.status}</Badge>
                    </div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit modal */}
      {editing && (
        <AppointmentEditModal
          appointment={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            setAppointments(appointments.map((a) => a.id === updated.id ? updated : a))
            setEditing(null)
          }}
        />
      )}

      {/* Create modal */}
      {creating && (
        <AppointmentCreateModal
          startTime={creating}
          services={services}
          appointments={appointments}
          onClose={() => setCreating(null)}
          onCreate={(newAppt: any) => {
            setAppointments([...appointments, newAppt])
            setCreating(null)
            toast({ title: 'Appointment booked', variant: 'success' })
          }}
        />
      )}
    </div>
  )
}

function AppointmentEditModal({ appointment, onClose, onSave }: { appointment: Appointment; onClose: () => void; onSave: (a: Appointment) => void }) {
  const [status, setStatus] = useState(appointment.status)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState(appointment.notes || '')

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      })
      if (res.ok) {
        onSave({ ...appointment, status, notes })
      }
    } catch (err) {
      onSave({ ...appointment, status, notes })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-ink-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{appointment.customer.name}</h2>
            <p className="text-sm text-ink-500 mt-0.5">
              {new Date(appointment.startsAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-6 space-y-3">
          <div className="p-3 bg-ink-50 rounded-lg text-sm">
            <div><strong>Service:</strong> {appointment.service?.name || 'None'}</div>
            <div><strong>Phone:</strong> {appointment.customer.phone}</div>
            <div><strong>Source:</strong> {appointment.source}</div>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Status</label>
            <select
              className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="booked">Booked</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No-show</option>
              <option value="pending_confirmation">Pending confirmation</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Notes</label>
            <textarea
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="p-4 border-t border-ink-100 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="brand" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function AppointmentCreateModal({ startTime, services, appointments, onClose, onCreate }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Book appointment</h2>
        <p className="text-sm text-ink-500 mb-4">
          To book directly, use the booking widget. Direct creation in admin is read-only.
        </p>
        <div className="flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}