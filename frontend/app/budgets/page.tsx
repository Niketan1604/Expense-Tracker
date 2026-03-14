'use client'
import { useState } from 'react'
import { Plus, Trash2, Target, ChevronLeft, ChevronRight } from 'lucide-react'
import { useBudgets, useCategories, useBreakdown, useMonthlyTotal } from '@/hooks/useApi'
import { budgetsApi } from '@/lib/api'
import { formatAmountCompact, formatMonth, currentMonth, prevMonth, nextMonth, decimalToPaise } from '@/lib/format'
import type { Budget } from '@/types'

function MonthStepper({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <div className="month-stepper">
      <button onClick={() => onChange(prevMonth(value))} className="month-stepper-btn"><ChevronLeft className="w-4 h-4" /></button>
      <span className="month-label">{formatMonth(value)}</span>
      <button onClick={() => onChange(nextMonth(value))} disabled={value === currentMonth()} className="month-stepper-btn"><ChevronRight className="w-4 h-4" /></button>
    </div>
  )
}

function BudgetModal({ month, categories, existing, onClose, onSave }: {
  month: string
  categories: { categoryId: string; name: string }[]
  existing: Budget[]
  onClose: () => void
  onSave:  () => void
}) {
  const existingIds = new Set(existing.map(b => b.categoryId))
  const available   = categories.filter(c => !existingIds.has(c.categoryId))

  const [categoryId, setCatId] = useState(available[0]?.categoryId ?? '')
  const [amount, setAmount]    = useState('')
  const [loading, setLoading]  = useState(false)
  const [error, setError]      = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      await budgetsApi.set({ categoryId, month, amount: decimalToPaise(parseFloat(amount)) })
      onSave(); onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2 className="modal-title">Set Budget</h2>
        {!available.length ? (
          <>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>All categories already have budgets for {formatMonth(month)}.</p>
            <button onClick={onClose} className="btn btn-ghost w-full rounded-xl">Close</button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="alert-error">{error}</div>}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Category</label>
              <select value={categoryId} onChange={e => setCatId(e.target.value)} required className="fm-input rounded-xl">
                {available.map(c => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Monthly Limit</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                required min="1" step="0.01" placeholder="0.00" className="fm-input rounded-xl" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn btn-ghost flex-1 py-2.5 rounded-xl">Cancel</button>
              <button type="submit" disabled={loading} className="btn btn-primary flex-1 py-2.5 rounded-xl">
                {loading ? 'Saving…' : 'Create Budget'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function BudgetsPage() {
  const [month, setMonth]       = useState(currentMonth())
  const [modalOpen, setModalOpen] = useState(false)

  const { data: budgets,      loading,  refetch } = useBudgets(month)
  const { data: categories }                      = useCategories()
  const { data: breakdown }                       = useBreakdown(month)
  const { data: monthlyTotal }                    = useMonthlyTotal(month)

  const catMap   = Object.fromEntries((categories ?? []).map(c => [c.categoryId, c]))
  const spendMap = Object.fromEntries((breakdown  ?? []).map(b => [b.categoryId, b.totalDebit]))

  const totalBudget = (budgets ?? []).reduce((s, b) => s + b.amount, 0)
  const totalSpent  = (budgets ?? []).reduce((s, b) => s + (spendMap[b.categoryId] ?? 0), 0)
  const overallPct  = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0

  const handleDelete = async (budget: Budget) => {
    if (!confirm('Remove this budget?')) return
    await budgetsApi.delete(budget.categoryId, month)
    refetch()
  }

  return (
    <div className="page animate-fadeUp">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="page-title">Budgets</h1>
          <p className="page-subtitle">Track spending against your monthly limits</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MonthStepper value={month} onChange={setMonth} />
          <button onClick={() => setModalOpen(true)} className="btn btn-primary rounded-xl">
            <Plus className="w-4 h-4" /> Add Budget
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left: budget list */}
        <div className="xl:col-span-2 space-y-4">
          {budgets && budgets.length > 0 && (
            <div className="card p-6">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Total Spent</p>
                  <p className="text-3xl font-black" style={{ color: 'var(--text)', letterSpacing: '-0.03em' }}>
                    {formatAmountCompact(totalSpent)}
                  </p>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>of {formatAmountCompact(totalBudget)} budget</p>
                </div>
                <span className="text-2xl font-black" style={{ color: overallPct >= 100 ? 'var(--red)' : overallPct >= 80 ? 'var(--amber)' : 'var(--mint)' }}>
                  {overallPct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${overallPct}%`,
                    background: overallPct >= 100 ? 'var(--red)' : overallPct >= 80 ? 'var(--amber)' : 'var(--mint)',
                  }} />
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>
          ) : !budgets?.length ? (
            <div className="card empty-state">
              <Target className="w-10 h-10" strokeWidth={1.5} />
              <p>No budgets set for {formatMonth(month)}.</p>
              <button onClick={() => setModalOpen(true)} className="btn btn-primary rounded-xl mt-2 text-sm">Add Budget</button>
            </div>
          ) : (
            budgets.map(budget => {
              const cat   = catMap[budget.categoryId]
              const spent = spendMap[budget.categoryId] ?? 0
              const pct   = Math.min((spent / budget.amount) * 100, 100)
              const over  = spent > budget.amount
              const barColor = over ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--mint)'

              return (
                <div key={budget.categoryId} className="card p-5 rounded-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ background: `${cat?.color ?? '#10b77f'}15` }}>
                        {cat?.icon || '📁'}
                      </div>
                      <div>
                        <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{cat?.name ?? budget.categoryId}</p>
                        <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                          {formatAmountCompact(spent)} of {formatAmountCompact(budget.amount)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold font-mono" style={{ color: barColor }}>{pct.toFixed(0)}%</span>
                      <button onClick={() => handleDelete(budget)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--muted)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  {over && (
                    <p className="mt-1.5 text-xs font-semibold" style={{ color: 'var(--red)' }}>
                      Over budget by {formatAmountCompact(spent - budget.amount)}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Right: summary sidebar */}
        <div className="space-y-5">
          {/* Dark ring card */}
          <div className="rounded-2xl p-7 text-white" style={{ background: '#0f172a' }}>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-5">Overall Progress</p>
            <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="66" fill="transparent" stroke="#1e293b" strokeWidth="12" />
                <circle cx="80" cy="80" r="66" fill="transparent" stroke="var(--mint)" strokeWidth="12"
                  strokeDasharray="414.69"
                  strokeDashoffset={414.69 * (1 - overallPct / 100)}
                  strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.7s ease' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black">{overallPct.toFixed(0)}%</span>
                <span className="text-xs text-slate-400 uppercase tracking-widest mt-0.5">used</span>
              </div>
            </div>
            <div className="mt-7 flex justify-between border-t border-slate-800 pt-5 text-sm">
              <div><p className="text-slate-400">Spent</p><p className="text-lg font-black">{formatAmountCompact(totalSpent)}</p></div>
              <div className="text-right"><p className="text-slate-400">Budget</p><p className="text-lg font-black">{formatAmountCompact(totalBudget)}</p></div>
            </div>
          </div>

          {/* Month summary */}
          {monthlyTotal && (
            <div className="card p-5 rounded-2xl space-y-3">
              <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>Month Summary</p>
              {[
                { label: 'Income',       value: formatAmountCompact(monthlyTotal.totalCredit), color: 'var(--mint)' },
                { label: 'Expenses',     value: formatAmountCompact(monthlyTotal.totalDebit),  color: 'var(--red)' },
                { label: 'Net Balance',  value: formatAmountCompact(monthlyTotal.netBalance),  color: 'var(--indigo)' },
                { label: 'Savings Rate', value: `${monthlyTotal.savingsRate.toFixed(1)}%`,     color: 'var(--amber)' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center text-sm">
                  <span style={{ color: 'var(--muted)' }}>{label}</span>
                  <span className="font-bold font-mono" style={{ color }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <BudgetModal month={month} categories={categories ?? []} existing={budgets ?? []}
          onClose={() => setModalOpen(false)} onSave={refetch} />
      )}
    </div>
  )
}
