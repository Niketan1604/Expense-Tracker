'use client'
import { useState, useEffect, useCallback } from 'react'
import { getAuthUser, authSignIn, authSignOut, authSignUp, authConfirmSignUp, authResendCode } from '@/lib/auth'

interface AuthUser { userId: string; username: string }

/**
 * Clears stale Amplify OAuth PKCE state from localStorage/sessionStorage.
 *
 * After signInWithRedirect, Amplify stores a PKCE verifier and OAuth state.
 * If the callback doesn't fully complete (e.g. user refreshes mid-flow,
 * or signInWithRedirect throws without exchanging the code), this state
 * persists. On the next page load, getCurrentUser() sees the pending OAuth
 * flag and waits for a flow that will never complete — hanging forever.
 *
 * Clearing these keys lets getCurrentUser() fall through to the normal
 * token check path.
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

    // Also check sessionStorage
    const sessionKeysToRemove: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && (
        key.includes('oAuthPKCE') ||
        key.includes('oAuthState') ||
        key.includes('oAuthSignIn') ||
        key.includes('inflightOAuth')
      )) {
        sessionKeysToRemove.push(key)
      }
    }
    sessionKeysToRemove.forEach(k => sessionStorage.removeItem(k))
  } catch {
    // Storage access can fail in some browsers — ignore
  }
}

/**
 * Wraps getCurrentUser() with a timeout.
 * If Amplify hangs (stale OAuth state), clears the state and retries once.
 */
async function getAuthUserWithTimeout(timeoutMs = 5000): Promise<{ userId: string; username: string }> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('AUTH_TIMEOUT')), timeoutMs)
  )

  try {
    return await Promise.race([getAuthUser(), timeout])
  } catch (err) {
    if (err instanceof Error && err.message === 'AUTH_TIMEOUT') {
      // getCurrentUser() hung — likely stale OAuth state
      clearStaleOAuthState()

      // Retry once after clearing state (short timeout)
      const retryTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AUTH_RETRY_TIMEOUT')), 2000)
      )
      return await Promise.race([getAuthUser(), retryTimeout])
    }
    throw err
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    try {
      const u = await getAuthUserWithTimeout()
      setUser({ userId: u.userId, username: u.username })
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

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