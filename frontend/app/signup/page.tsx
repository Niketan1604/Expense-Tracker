'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, User, Eye, EyeOff, Wallet, ArrowRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

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
      router.replace('/')
    } catch (err) { setError(err instanceof Error ? err.message : 'Verification failed') }
    finally { setLoading(false) }
  }

  const handleResend = async () => {
    try {
      await resendCode(email)
      setResent(true); setTimeout(() => setResent(false), 4000)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to resend') }
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
            <form onSubmit={handleSignUp} className="space-y-4">
              {[
                { label: 'Full Name',      Icon: User, type: 'text',  val: name,     set: setName,     ph: 'Your name' },
                { label: 'Email Address',  Icon: Mail, type: 'email', val: email,    set: setEmail,    ph: 'you@example.com' },
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

              <button type="submit" disabled={loading} className="btn btn-primary w-full py-3.5 rounded-2xl text-sm mt-2">
                {loading ? 'Creating account…' : <><span>Get Started</span><ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
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
