'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff, Wallet, ArrowRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const { signIn } = useAuth()
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await signIn(email, password)
      router.replace('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-16"
        style={{ background: 'var(--mint)' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full blur-3xl opacity-20" style={{ background: '#fff' }} />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full blur-3xl opacity-10" style={{ background: '#000' }} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-14">
            <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Wallet className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-3xl font-black text-white tracking-tight">FlowMint</span>
          </div>
          <h2 className="text-5xl font-black text-white leading-tight mb-5" style={{ letterSpacing: '-0.03em' }}>
            Master your money<br />with precision.
          </h2>
          <p className="text-lg text-white/75 font-medium leading-relaxed max-w-md">
            Track every rupee in and out. Understand exactly where your money goes with real-time cash flow intelligence.
          </p>
        </div>
        <div className="relative z-10">
          <p className="text-sm text-white/70 font-medium">Your personal cash flow dashboard.</p>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: 'var(--surface)' }}>
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 justify-center mb-10">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-mint-500">
              <Wallet className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-2xl font-black" style={{ color: 'var(--text)' }}>FlowMint</span>
          </div>

          <h2 className="text-3xl font-black mb-1" style={{ color: 'var(--text)', letterSpacing: '-0.03em' }}>Welcome back</h2>
          <p className="text-sm mb-8 font-medium" style={{ color: 'var(--muted)' }}>Sign in to your account to continue.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <div className="alert-error">{error}</div>}

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="you@example.com"
                  className="fm-input pl-10 py-3 rounded-2xl" />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Password</label>
                <Link href="#" className="text-xs font-bold hover:underline" style={{ color: 'var(--mint)' }}>Forgot?</Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••"
                  className="fm-input pl-10 pr-10 py-3 rounded-2xl" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full py-3.5 rounded-2xl text-sm mt-2">
              {loading ? 'Signing in…' : <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <p className="mt-8 text-center text-sm font-medium" style={{ color: 'var(--muted)' }}>
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-bold hover:underline" style={{ color: 'var(--mint)' }}>Sign up free</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
