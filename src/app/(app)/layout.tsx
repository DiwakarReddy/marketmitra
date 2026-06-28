import { Sidebar } from '@/components/sidebar'
import { LanguageProvider } from '@/components/language-toggle'
import { ToastProvider } from '@/components/ui/toast'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect('/login')
  }

  const businessId = (session as any).businessId
  const userPlan = (session as any).plan
  const userRole = (session as any).role

  return (
    <ToastProvider>
      <LanguageProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar
            businessId={businessId}
            userPlan={userPlan}
            userRole={userRole}
            userEmail={session.user.email}
          />
          <main className="flex-1 overflow-y-auto scrollbar-hide bg-ink-50/50">{children}</main>
        </div>
      </LanguageProvider>
    </ToastProvider>
  )
}