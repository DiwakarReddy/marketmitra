import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'
import { ListChecks } from 'lucide-react'
import { CustomersClient } from './customers-client'
import { CustomerImporter } from './customer-importer'
import { AddCustomerButton } from './add-customer-button'

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

  // Count active custom fields for this business
  const customFieldCount = await prisma.customField.count({
    where: { businessId, active: true },
  })

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">Customers</h1>
          <p className="text-ink-600 mt-1">{customers.length} customers in your database</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/customers/fields"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-ink-700 bg-white border border-ink-200 rounded-lg hover:bg-ink-50 transition"
          >
            <ListChecks className="w-4 h-4 text-ink-500" />
            Custom fields
            {customFieldCount > 0 && (
              <span className="ml-1 text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-teal-100 text-teal-700">
                {customFieldCount}
              </span>
            )}
          </Link>
          <CustomerImporter />
          <AddCustomerButton />
        </div>
      </div>
      <CustomersClient initialCustomers={customers as any} />
    </div>
  )
}