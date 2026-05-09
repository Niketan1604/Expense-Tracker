'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

/**
 * Root page — redirects to /dashboard.
 *
 * Auth gating is handled entirely by AppShell:
 *   - Authenticated   → AppShell renders children → dashboard loads
 *   - Unauthenticated → AppShell redirects to /login
 *
 * IMPORTANT — CloudFront fallback safety:
 *   On CloudFront (before the URI rewrite function is deployed),
 *   S3 returns 403 for routes like /login, /auth/callback, etc.
 *   CloudFront's error page serves /index.html (THIS component).
 *   If we blindly do router.replace('/dashboard'), we'd clobber
 *   the /auth/callback URL and lose the OAuth authorization code.
 *
 *   Fix: only redirect when pathname is actually '/'.
 *   For any other URL, return null and let Next.js client-side
 *   router load the correct page component.
 */
export default function RootPage() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Only redirect if we're actually on the root path.
    // If CloudFront served index.html as fallback for another route,
    // pathname will be that route (e.g. /auth/callback) — don't redirect.
    if (pathname === '/') {
      router.replace('/dashboard')
    }
  }, [router, pathname])

  return null
}
