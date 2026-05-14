'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, User, Eye, EyeOff, Wallet, ArrowRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { signInWithRedirect } from 'aws-amplify/auth'

import { userApi } from '@/lib/api'

type Step = 'form' | 'confirm'

export default function SignupPage() {
  const { signUp, confirmSignUp, resendCode, signIn } = useAuth()
  const router = useRouter()
  const [step, setStep]         = useState<Step>('form')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode]         = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]       = useState('')
  const [resent, setResent]     = useState(false)

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await signUp(email, password, name)
      setStep('confirm')
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign up failed') }
    finally { setLoading(false) }
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await confirmSignUp(email, code)
      await signIn(email, password)
      
      try {
        await userApi.getProfile()
      } catch {
        await userApi.updateProfile({ name: name || email.split('@')[0], currency: 'INR' })
      }

      router.replace('/dashboard')
    } catch (err) { setError(err instanceof Error ? err.message : 'Verification failed') }
    finally { setLoading(false) }
  }

  const handleResend = async () => {
    try {
      await resendCode(email)
      setResent(true); setTimeout(() => setResent(false), 4000)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to resend') }
  }

  const handleGoogle = async () => {
    setGoogleLoading(true); setError('')
    try {
      await signInWithRedirect({ provider: 'Google' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign in failed')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* Left panel — always dark */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-16"
        style={{ background: '#0f172a' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-10 left-10 w-64 h-64 rounded-full blur-[100px] opacity-20" style={{ background: 'var(--mint)' }} />
          <div className="absolute bottom-10 right-10 w-64 h-64 rounded-full blur-[100px] opacity-15" style={{ background: 'var(--indigo)' }} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-14">
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--mint)' }}>
              <Wallet className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-3xl font-black text-white tracking-tight">FlowMint</span>
          </div>
          <h2 className="text-5xl font-black text-white leading-tight mb-5" style={{ letterSpacing: '-0.03em' }}>
            Start your financial<br />journey today.
          </h2>
          <p className="text-lg text-slate-400 font-medium leading-relaxed max-w-md">
            Take control of your cash flow. Track every credit and debit, set budgets, and watch your savings grow.
          </p>
        </div>
        <div className="relative z-10 p-6 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-base italic text-slate-300 mb-4 leading-relaxed">
            &quot;FlowMint gave me complete visibility into where my money actually goes.&quot;
          </p>
          <p className="text-sm font-bold text-white">Priya S. · Software Engineer, Bangalore</p>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: 'var(--surface)' }}>
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 justify-center mb-10">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-mint-500">
              <Wallet className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-2xl font-black" style={{ color: 'var(--text)' }}>FlowMint</span>
          </div>

          <h2 className="text-3xl font-black mb-1" style={{ color: 'var(--text)', letterSpacing: '-0.03em' }}>
            {step === 'form' ? 'Create account' : 'Check your email'}
          </h2>
          <p className="text-sm mb-8 font-medium" style={{ color: 'var(--muted)' }}>
            {step === 'form' ? 'Join FlowMint and start tracking your cash flow.' : `We sent a 6-digit code to ${email}`}
          </p>

          {error  && <div className="alert-error mb-5">{error}</div>}
          {resent && <div className="alert-success mb-5">Code resent to {email}</div>}

          {step === 'form' ? (
            <>
              {/* Google button */}
              <button onClick={handleGoogle} disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 py-3 rounded-2xl font-semibold text-sm mb-5 transition-all disabled:opacity-50"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--mint)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                {googleLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-mint-500" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                {googleLoading ? 'Redirecting…' : 'Continue with Google'}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>or</span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>

              <form onSubmit={handleSignUp} className="space-y-4">
                {[
                  { label: 'Full Name',     Icon: User, type: 'text',  val: name,  set: setName,  ph: 'Your name' },
                  { label: 'Email Address', Icon: Mail, type: 'email', val: email, set: setEmail, ph: 'you@example.com' },
                ].map(({ label, Icon, type, val, set, ph }) => (
                  <div key={label}>
                    <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>{label}</label>
                    <div className="relative">
                      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
                      <input type={type} value={val} onChange={e => set(e.target.value)} required placeholder={ph}
                        className="fm-input pl-10 py-3 rounded-2xl" />
                    </div>
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      required minLength={8} placeholder="Min. 8 characters"
                      className="fm-input pl-10 pr-10 py-3 rounded-2xl" />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }}>
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading || googleLoading} className="btn btn-primary w-full py-3.5 rounded-2xl text-sm mt-2">
                  {loading ? 'Creating account…' : <><span>Get Started</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </>
          ) : (
            <form onSubmit={handleConfirm} className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>Verification Code</label>
                <input type="text" value={code} onChange={e => setCode(e.target.value)} required
                  maxLength={6} placeholder="000000"
                  className="fm-input py-4 text-2xl text-center font-mono tracking-[0.6em] rounded-2xl" />
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary w-full py-3.5 rounded-2xl text-sm">
                {loading ? 'Verifying…' : <><span>Verify &amp; Sign in</span><ArrowRight className="w-4 h-4" /></>}
              </button>
              <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>
                Didn&apos;t get it?{' '}
                <button type="button" onClick={handleResend} className="font-bold hover:underline" style={{ color: 'var(--mint)' }}>Resend code</button>
              </p>
            </form>
          )}

          {step === 'form' && (
            <p className="mt-8 text-center text-sm font-medium" style={{ color: 'var(--muted)' }}>
              Already have an account?{' '}
              <Link href="/login" className="font-bold hover:underline" style={{ color: 'var(--mint)' }}>Sign in</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
