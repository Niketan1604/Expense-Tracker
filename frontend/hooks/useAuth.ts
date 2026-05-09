'use client'
import { useState, useEffect, useCallback } from 'react'
import { getAuthUser, authSignIn, authSignOut, authSignUp, authConfirmSignUp, authResendCode } from '@/lib/auth'

interface AuthUser { userId: string; username: string }

import { usePathname } from 'next/navigation'

/**
 * Clears stale Amplify OAuth PKCE state.
 */
function clearStaleOAuthState() {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (
        key.includes('oAuthPKCE') ||
        key.includes('oAuthState') ||
        key.includes('oAuthSignIn') ||
        key.includes('inflightOAuth')
      )) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
  } catch { }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  const fetchUser = useCallback(async () => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 2000)
      )
      
      let u;
      try {
        u = await Promise.race([getAuthUser(), timeoutPromise])
      } catch (err) {
        if (err instanceof Error && err.message === 'AUTH_TIMEOUT') {
          // If it hangs for 2s AND we aren't on the callback page, it's a stale state
          if (pathname !== '/auth/callback') {
            clearStaleOAuthState()
            u = await getAuthUser() // Retry instantly, should succeed/fail immediately
          } else {
            // If we ARE on the callback page, just let it throw or return null
            throw err
          }
        } else {
          throw err
        }
      }

      setUser({ userId: u.userId, username: u.username })
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [pathname])

  useEffect(() => { fetchUser() }, [fetchUser])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await authSignOut() // Ensure any existing session is cleared before signing in
    } catch {
      // Ignore sign out errors, as we want to proceed with sign in regardless
    }
    await authSignIn(email, password)
    await fetchUser()
  }, [fetchUser])

  const signOut = useCallback(async () => {
    await authSignOut()
    setUser(null)
  }, [])

  return {
    user, loading,
    signIn, signOut,
    signUp: authSignUp,
    confirmSignUp: authConfirmSignUp,
    resendCode: authResendCode,
  }
}