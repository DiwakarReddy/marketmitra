import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CustomersClient } from './customers-client'
import { CustomerImporter } from './customer-importer'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const customers = await prisma.customer.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">Customers</h1>
          <p className="text-ink-600 mt-1">{customers.length} customers in your database</p>
        </div>
      </div>
      <CustomersClient initialCustomers={customers as any} />
      <CustomerImporter />
    </div>
  )
}