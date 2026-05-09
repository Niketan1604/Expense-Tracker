'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

/**
 * Root page — acts as an auth-aware redirect.
 *
 * Why not just `export { default } from './dashboard/page'`?
 *   On CloudFront, ALL 403/404 responses from S3 get rewritten to /index.html
 *   (the static export root). If this page directly rendered the dashboard,
 *   then refreshing ANY invalid path (including /login after S3 403) would
 *   show the dashboard instead of the intended page.
 *
 *   This component checks auth state and explicitly redirects:
 *     - Authenticated   → /dashboard
 *     - Unauthenticated → /login
 */
export default function RootPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    router.replace(user ? '/dashboard' : '/login')
  }, [user, loading, router])

  // Show loading spinner while determining auth state
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-border border-t-mint-500 animate-spin" />
        <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    </div>
  )
}
