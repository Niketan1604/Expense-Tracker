'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'

const PUBLIC = ['/login', '/signup', '/auth/callback']

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()
  const isPublic = PUBLIC.includes(pathname)

  useEffect(() => {
    if (loading) return
    if (!user && !isPublic) router.replace('/login')
    if (user  &&  isPublic) router.replace('/dashboard')
  }, [user, loading, isPublic, router])

  // Never block public routes (login, signup, auth/callback) with a loading screen.
  // /auth/callback in particular needs to mount immediately so its Hub listener
  // can catch the OAuth signedIn event before it fires.
  if (isPublic) {
    if (user && pathname !== '/auth/callback') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-border border-t-mint-500 animate-spin" />
            <p className="text-sm text-muted font-medium">Loading…</p>
          </div>
        </div>
      )
    }
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-border border-t-mint-500 animate-spin" />
          <p className="text-sm text-muted font-medium">Loading…</p>
        </div>
      </div>
    )
  }
  if (!user)    return null

  return (
    <div className="min-h-screen flex bg-bg">
      <Sidebar />
      <main className="flex-1 lg:ml-64 min-h-screen pb-20 lg:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}