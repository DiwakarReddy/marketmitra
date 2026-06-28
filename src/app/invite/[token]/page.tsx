import { prisma } from '@/lib/db'
import { acceptInvite } from './actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { redirect } from 'next/navigation'
import { CheckCircle2, XCircle, Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: { token: string } }) {
  const invite = await prisma.teamInvite.findUnique({
    where: { token: params.token },
  })

  // Find business name
  let businessName = 'Unknown business'
  if (invite) {
    const biz = await prisma.business.findUnique({ where: { id: invite.businessId } })
    businessName = biz?.name || businessName
  }

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-ink-50">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2">Invalid invite link</h2>
            <p className="text-ink-600">This invite link is invalid or has been removed.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (invite.acceptedAt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-ink-50">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2">Already accepted</h2>
            <p className="text-ink-600">This invite has already been used.</p>
            <Button className="mt-4" asChild><a href="/login">Sign in</a></Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (invite.expiresAt < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-ink-50">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2">Invite expired</h2>
            <p className="text-ink-600">Ask your team owner for a new invite.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show the accept form
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-ink-50">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <Building2 className="w-12 h-12 text-teal-600 mx-auto mb-2" />
          <CardTitle className="text-2xl">Join {businessName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-ink-600">
            You've been invited to join as a <strong>{invite.role}</strong>.
          </p>
          <form action={async () => {
            'use server'
            await acceptInvite(params.token)
            redirect('/login?invited=1')
          }}>
            <Button type="submit" variant="brand" className="w-full">Accept invite & sign up</Button>
          </form>
          <p className="text-xs text-center text-ink-500">Invite expires {invite.expiresAt.toLocaleDateString('en-IN')}</p>
        </CardContent>
      </Card>
    </div>
  )
}