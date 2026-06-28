import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { KnowledgeEditor } from './knowledge-editor'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } })

  return <KnowledgeEditor initialKnowledge={business?.knowledge || ''} />
}