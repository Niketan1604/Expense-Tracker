'use client'
import { useState, useEffect, useCallback } from 'react'
import { getAuthUser, authSignIn, authSignOut, authSignUp, authConfirmSignUp, authResendCode } from '@/lib/auth'

interface AuthUser { userId: string; username: string }

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    try {
      const u = await getAuthUser()
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
