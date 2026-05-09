'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Root page — redirects to /dashboard.
 *
 * Auth gating is handled entirely by AppShell:
 *   - Authenticated   → AppShell renders children → dashboard loads
 *   - Unauthenticated → AppShell redirects to /login
 *
 * This page does NOT call useAuth() — that would create a second
 * independent auth check on top of AppShell's, causing a double-loading
 * state that hangs after OAuth signInWithRedirect.
 *
 * Why not `export { default } from './dashboard/page'`?
 *   On CloudFront, S3 403s get rewritten to /index.html. Directly
 *   rendering the dashboard here would show it on any 403 route
 *   (including /login). A client-side redirect is safer.
 */
export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard')
  }, [router])

  return null
}
