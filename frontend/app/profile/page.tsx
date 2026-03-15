'use client'
import { useState, useEffect } from 'react'
import { Save, User, CheckCircle2 } from 'lucide-react'
import { useProfile } from '@/hooks/useApi'
import { userApi } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

const CURRENCIES = ['INR','USD','EUR','GBP','AUD','CAD','SGD','JPY']

export default function ProfilePage() {
  const { data: profile, loading, refetch } = useProfile()
  const { user: authUser } = useAuth()
  const [name, setName]         = useState('')
  const [currency, setCurrency] = useState('INR')
  const [saving, setSaving]     = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    if (profile) {
      // Profile exists in DB — use it
      setName(profile.name || authUser?.username || '')
      setCurrency(profile.currency || 'INR')
    } else if (!loading && authUser) {
      // First time — no profile yet, pre-fill from Cognito session
      setName(authUser.username || '')
    }
  }, [profile, loading, authUser])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess(false)
    try {
      await userApi.updateProfile({ name, currency });
      setSuccess(true); refetch()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save') }
    finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton h-10 w-40 rounded-xl mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="md:col-span-2 skeleton h-64 rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="page animate-fadeUp pb-24 lg:pb-8">
      <h1 className="page-title mb-1">Account Settings</h1>
      <p className="page-subtitle mb-8">Manage your profile and preferences</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Profile card */}
        <div className="card p-7 rounded-2xl flex flex-col items-center text-center">
          <div className="h-20 w-20 rounded-full flex items-center justify-center mb-4"
            style={{ background: 'var(--mint-dim)', border: '3px solid var(--border)' }}>
            <User className="w-9 h-9" style={{ color: 'var(--mint)' }} strokeWidth={1.5} />
          </div>
          <p className="text-lg font-black" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>{profile?.name}</p>
          <p className="text-sm mt-1 mb-3" style={{ color: 'var(--muted)' }}>{profile?.email}</p>
          <span className="badge badge-credit gap-1.5">
            <CheckCircle2 className="w-3 h-3" /> Verified
          </span>
          <div className="w-full mt-6 pt-5 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
            {[
              { label: 'Currency', value: profile?.currency },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span style={{ color: 'var(--muted)' }}>{label}</span>
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="md:col-span-2 card p-7 rounded-2xl">
          <h3 className="font-black text-base mb-6" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>Personal Information</h3>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {error   && <div className="sm:col-span-2 alert-error">{error}</div>}
            {success && (
              <div className="sm:col-span-2 alert-success flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Profile updated successfully.
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required className="fm-input rounded-xl" />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>Email Address</label>
              <input type="email" value={profile?.email ?? ''} disabled className="fm-input rounded-xl opacity-50 cursor-not-allowed" />
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Email cannot be changed here.</p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className="fm-input rounded-xl">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="sm:col-span-2 pt-1">
              <button type="submit" disabled={saving} className="btn btn-primary rounded-xl">
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  )
}
