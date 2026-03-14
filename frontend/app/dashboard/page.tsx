'use client'
import { useState } from 'react'
import { TrendingUp, TrendingDown, Wallet, PiggyBank, ChevronLeft, ChevronRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useMonthlyTotal, useTopCategories, useTrend, useCategories } from '@/hooks/useApi'
import { formatAmountCompact, formatMonth, formatMonthShort, currentMonth, prevMonth, nextMonth } from '@/lib/format'

function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <div className="month-stepper">
      <button onClick={() => onChange(prevMonth(value))} className="month-stepper-btn">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="month-label">{formatMonth(value)}</span>
      <button onClick={() => onChange(nextMonth(value))} disabled={value === currentMonth()} className="month-stepper-btn">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, iconBg, iconColor, valueColor }: {
  label: string; value: string; sub?: string; icon: React.ElementType
  iconBg: string; iconColor: string; valueColor?: string
}) {
  return (
    <div className="stat-card card-hover">
      <div className="flex justify-between items-start mb-4">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
          <Icon className="w-5 h-5" style={{ color: iconColor }} />
        </div>
      </div>
      <p className="stat-label">{label}</p>
      <p className="stat-value" style={{ color: valueColor ?? 'var(--text)' }}>{value}</p>
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  )
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2.5 text-xs" style={{ boxShadow: 'var(--shadow-lg)', minWidth: '120px' }}>
      <p className="font-semibold mb-1.5" style={{ color: 'var(--text)' }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>{formatAmountCompact(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth())

  const { data: summary, loading: lSum } = useMonthlyTotal(month)
  const { data: topCats, loading: lTop } = useTopCategories(month, 'DEBIT', 5)
  const { data: categories }             = useCategories()
  const { data: trend,   loading: lTrend } = useTrend(6)

  const catMap = Object.fromEntries((categories ?? []).map(c => [c.categoryId, c.name]))

  const trendData = (trend ?? []).map(t => ({
    month: formatMonthShort(t.month),
    Income:   t.totalCredit,
    Expenses: t.totalDebit,
  }))

  const sr = summary?.savingsRate ?? 0
  const savingsColor = sr >= 30 ? 'var(--mint)' : sr >= 10 ? 'var(--amber)' : 'var(--red)'
  const savingsLabel = sr >= 30 ? '🎉 Excellent!'  : sr >= 10 ? 'On track'   : 'Needs attention'

  return (
    <div className="page animate-fadeUp">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your cash flow at a glance</p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {/* Summary cards */}
      {lSum ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Income"   value={formatAmountCompact(summary?.totalCredit ?? 0)}
            sub={`${summary?.txnCount ?? 0} transactions`}
            icon={TrendingUp}   iconBg="var(--mint-dim)"   iconColor="var(--mint)"   valueColor="var(--mint)" />
          <StatCard label="Total Expenses" value={formatAmountCompact(summary?.totalDebit ?? 0)}
            icon={TrendingDown} iconBg="var(--red-dim)"    iconColor="var(--red)"    valueColor="var(--red)" />
          <StatCard label="Net Balance"    value={formatAmountCompact(summary?.netBalance ?? 0)}
            icon={Wallet}       iconBg="var(--indigo-dim)" iconColor="var(--indigo)" />
          <StatCard label="Savings Rate"   value={`${sr.toFixed(1)}%`}
            sub={savingsLabel}
            icon={PiggyBank}    iconBg={`${savingsColor}18`} iconColor={savingsColor} valueColor={savingsColor} />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Trend chart */}
        <div className="card lg:col-span-2 p-6">
          <h3 className="font-black text-base mb-5" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>6-Month Trend</h3>
          {lTrend ? (
            <div className="skeleton h-56 rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={trendData} barGap={3} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false}
                  tick={{ fill: 'var(--muted)', fontSize: 11, fontWeight: 600 }} dy={8} />
                <YAxis axisLine={false} tickLine={false}
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  tickFormatter={v => formatAmountCompact(v)} width={52} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'var(--surface-2)' }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16, color: 'var(--muted)' }} />
                <Bar dataKey="Income"   fill="var(--mint)" radius={[4,4,0,0]} />
                <Bar dataKey="Expenses" fill="var(--red)"  radius={[4,4,0,0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top expenses */}
        <div className="card p-6">
          <h3 className="font-black text-base mb-5" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>Top Expenses</h3>
          {lTop ? (
            <div className="space-y-4">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-9 rounded-lg" />)}</div>
          ) : !topCats?.length ? (
            <div className="empty-state py-12">
              <p>No expenses this month</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topCats.map((cat, i) => {
                const pct = (cat.totalDebit / (topCats[0]?.totalDebit ?? 1)) * 100
                return (
                  <div key={cat.categoryId}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                        {catMap[cat.categoryId] ?? cat.categoryId}
                      </span>
                      <span className="text-sm font-bold font-mono" style={{ color: 'var(--red)' }}>
                        {formatAmountCompact(cat.totalDebit)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: 'var(--red)', opacity: 0.55 + 0.45 * (1 - i / 5) }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
