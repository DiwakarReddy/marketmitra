import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CampaignsClient } from './campaigns-client'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const campaigns = await prisma.campaign.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return <CampaignsClient initialCampaigns={campaigns as any} />
}