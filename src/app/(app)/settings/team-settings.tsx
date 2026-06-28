'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { UserPlus, Trash2, Mail, Shield, Eye, Building2, Loader2 } from 'lucide-react'

interface Member {
  id: string
  name: string | null
  email: string | null
  role: string
  createdAt: Date
}

interface Invite {
  id: string
  email: string
  role: string
  createdAt: Date
  expiresAt: Date
}

export function TeamSettings({
  businessId,
  members,
  invites,
  isOwner,
}: {
  businessId: string
  members: Member[]
  invites: Invite[]
  isOwner: boolean
}) {
  const { toast } = useToast()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [sending, setSending] = useState(false)
  const [localInvites, setLocalInvites] = useState(invites)

  const sendInvite = async () => {
    if (!inviteEmail.includes('@')) {
      toast({ title: 'Invalid email', variant: 'error' })
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast({ title: `Invite sent to ${inviteEmail}`, variant: 'success' })
      setLocalInvites([
        ...localInvites,
        { id: data.invite.id, email: data.invite.email, role: data.invite.role, createdAt: new Date(), expiresAt: new Date(data.invite.expiresAt) },
      ])
      setInviteEmail('')
    } catch (err: any) {
      toast({ title: 'Could not send invite', description: err.message, variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const cancelInvite = async (id: string) => {
    try {
      await fetch('/api/team/invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setLocalInvites(localInvites.filter((i) => i.id !== id))
      toast({ title: 'Invite cancelled', variant: 'success' })
    } catch (err) {
      toast({ title: 'Failed to cancel', variant: 'error' })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-teal-600" />
          Team
          <Badge>{members.length + localInvites.length} total</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invite form */}
        {isOwner && (
          <div className="p-4 bg-ink-50 rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <UserPlus className="w-4 h-4" />
              Invite a team member
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_120px] gap-2">
              <Input
                type="email"
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <select
                className="h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="manager">Manager — can send campaigns, view all</option>
                <option value="viewer">Viewer — read-only</option>
              </select>
              <Button onClick={sendInvite} disabled={sending} variant="brand">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {sending ? 'Sending' : 'Send invite'}
              </Button>
            </div>
          </div>
        )}

        {/* Active members */}
        <div className="space-y-2">
          {members.map((m) => {
            const initials = (m.name || m.email || '?').split(/\s|@/)[0].slice(0, 2).toUpperCase()
            const color = ['bg-pink-400', 'bg-blue-400', 'bg-green-400', 'bg-purple-400', 'bg-amber-400'][m.id.charCodeAt(0) % 5]
            return (
              <div key={m.id} className="flex items-center justify-between p-3 border border-ink-100 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 ${color} rounded-full flex items-center justify-center text-white font-semibold`}>
                    {initials}
                  </div>
                  <div>
                    <div className="font-medium text-ink-900 text-sm">{m.name || m.email}</div>
                    <div className="text-xs text-ink-500">{m.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.role === 'owner' ? 'default' : 'secondary'}>
                    {m.role === 'owner' ? <Shield className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                    {m.role}
                  </Badge>
                  {m.role !== 'owner' && isOwner && (
                    <Button size="sm" variant="ghost">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Pending invites */}
        {localInvites.length > 0 && (
          <div className="pt-3 border-t border-ink-100">
            <div className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">Pending invites</div>
            {localInvites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-3 border border-ink-100 rounded-lg mb-2 bg-amber-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-amber-200 rounded-full flex items-center justify-center">
                    <Mail className="w-4 h-4 text-amber-700" />
                  </div>
                  <div>
                    <div className="font-medium text-ink-900 text-sm">{inv.email}</div>
                    <div className="text-xs text-ink-500">
                      Expires {new Date(inv.expiresAt).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="warning">{inv.role}</Badge>
                  {isOwner && (
                    <Button size="sm" variant="ghost" onClick={() => cancelInvite(inv.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}