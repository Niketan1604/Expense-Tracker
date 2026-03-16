'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { getAuthUser } from '@/lib/auth'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    // Amplify automatically handles the code exchange when this page loads.
    // We just need to wait briefly then verify the session is established.
    const verify = async () => {
      // Give Amplify a moment to process the OAuth code in the URL
      await new Promise(res => setTimeout(res, 1500))
      try {
        await getAuthUser()
        router.replace('/')
      } catch {
        setError('Sign in failed. Please try again.')
        setTimeout(() => router.replace('/login'), 2500)
      }
    }
    verify()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="h-14 w-14 rounded-2xl flex items-center justify-center bg-mint-500 shadow-lg shadow-mint-500/30">
          <Wallet className="w-7 h-7 text-white" strokeWidth={2.5} />
        </div>
        {error ? (
          <>
            <p className="text-base font-semibold" style={{ color: 'var(--red)' }}>{error}</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Redirecting to login…</p>
          </>
        ) : (
          <>
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-mint-500" />
            <div>
              <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>Signing you in…</p>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Just a moment</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
