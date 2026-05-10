'use client'
import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTransactions, useCategories } from '@/hooks/useApi'
import { transactionsApi } from '@/lib/api'
import { formatAmount, formatDate, formatMonth, currentMonth, prevMonth, nextMonth, decimalToPaise, todayISO } from '@/lib/format'
import type { Transaction, TransactionType, CreateTransactionBody } from '@/types'

function MonthStepper({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <div className="month-stepper">
      <button onClick={() => onChange(prevMonth(value))} className="month-stepper-btn"><ChevronLeft className="w-4 h-4" /></button>
      <span className="month-label">{formatMonth(value)}</span>
      <button onClick={() => onChange(nextMonth(value))} disabled={value === currentMonth()} className="month-stepper-btn"><ChevronRight className="w-4 h-4" /></button>
    </div>
  )
}

function TxnModal({ txn, categories, onClose, onSave }: {
  txn?: Transaction
  categories: { categoryId: string; name: string }[]
  onClose: () => void
  onSave:  () => void
}) {
  const [type, setType]           = useState<TransactionType>(txn?.type ?? 'DEBIT')
  const [amount, setAmount]       = useState(txn ? String(txn.amount / 100) : '')
  const [categoryId, setCatId]    = useState(txn?.categoryId ?? categories[0]?.categoryId ?? '')
  const [date, setDate]           = useState(txn?.date ?? todayISO())
  const [description, setDesc]    = useState(txn?.description ?? '')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const body: CreateTransactionBody = {
        transactionId: txn ? undefined : crypto.randomUUID(),
        type, amount: decimalToPaise(parseFloat(amount)),
        categoryId, date,
        description: description || undefined,
      }
      txn ? await transactionsApi.update(txn.transactionId, body) : await transactionsApi.create(body)
      onSave(); onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2 className="modal-title">{txn ? 'Edit Transaction' : 'New Transaction'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="alert-error">{error}</div>}

          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(['CREDIT','DEBIT'] as TransactionType[]).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className="py-2.5 rounded-xl text-sm font-bold transition-all"
                style={type === t
                  ? { background: t === 'CREDIT' ? 'var(--mint-dim)' : 'var(--red-dim)',
                      color: t === 'CREDIT' ? 'var(--mint)' : 'var(--red)',
                      border: `1.5px solid ${t === 'CREDIT' ? 'var(--mint)' : 'var(--red)'}` }
                  : { background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }
                }>{t}</button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Amount</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                required min="0.01" step="0.01" placeholder="0.00" className="fm-input rounded-xl" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="fm-input rounded-xl" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Category</label>
            <select value={categoryId} onChange={e => setCatId(e.target.value)} required className="fm-input rounded-xl">
              {categories.map(c => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
              Description <span className="normal-case font-normal opacity-60">(optional)</span>
            </label>
            <input type="text" value={description} onChange={e => setDesc(e.target.value)}
              placeholder="e.g. Lunch at Café" className="fm-input rounded-xl" />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1 py-2.5 rounded-xl">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1 py-2.5 rounded-xl">
              {loading ? 'Saving…' : txn ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TransactionsPage() {
  const [month, setMonth]           = useState(currentMonth())
  const [typeFilter, setTypeFilter] = useState<TransactionType | ''>('')
  const [catFilter, setCatFilter]   = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [editTxn, setEditTxn]       = useState<Transaction | undefined>()
  const [deleting, setDeleting]     = useState<string | null>(null)

  const [allTxns, setAllTxns]     = useState<Transaction[]>([])
  const [cursor, setCursor]       = useState<string | undefined>()

  const { data: res, loading, refetch: baseRefetch } = useTransactions({
    month,
    type: typeFilter || undefined,
    categoryId: catFilter || undefined,
    cursor,
    limit: 15
  })

  // Reset list when filters change
  useEffect(() => {
    setAllTxns([])
    setCursor(undefined)
  }, [month, typeFilter, catFilter])

  // Append new data as it arrives
  useEffect(() => {
    if (res?.items) {
      setAllTxns(prev => (cursor ? [...prev, ...res.items] : res.items))
    }
  }, [res, cursor])

  const loadMore = () => { if (res?.nextCursor) setCursor(res.nextCursor) }
  const refetch  = () => { setCursor(undefined); baseRefetch() }
  const { data: categories } = useCategories()
  const catMap = Object.fromEntries((categories ?? []).map(c => [c.categoryId, c.name]))

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return
    setDeleting(id)
    try { await transactionsApi.delete(id); refetch() }
    finally { setDeleting(null) }
  }

  const openEdit = (txn: Transaction) => { setEditTxn(txn); setModalOpen(true) }
  const openNew  = () => { setEditTxn(undefined); setModalOpen(true) }

  return (
    <div className="page animate-fadeUp">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">{allTxns.length} records shown</p>
        </div>
        <button onClick={openNew} className="btn btn-primary rounded-xl self-start sm:self-auto">
          <Plus className="w-4 h-4" /> New Transaction
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-center gap-3 mb-6">
        <MonthStepper value={month} onChange={setMonth} />
        <div className="h-5 w-px hidden sm:block" style={{ background: 'var(--border)' }} />
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Type</span>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as TransactionType | '')}
              className="fm-input w-auto rounded-lg text-xs py-2 px-3">
              <option value="">All</option>
              <option value="CREDIT">Credit</option>
              <option value="DEBIT">Debit</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Category</span>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              className="fm-input w-auto rounded-lg text-xs py-2 px-3">
              <option value="">All</option>
              {categories?.map(c => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading && !allTxns.length ? (
          <div>{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-[68px] rounded-none border-b" style={{ borderColor: 'var(--border)' }} />)}</div>
        ) : !allTxns.length ? (
          <div className="empty-state">
            <p>No transactions found for this period.</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead style={{ borderBottom: '1px solid var(--border)' }}>
                  <tr>
                    {['Date','Description','Category','Type','Amount',''].map(h => (
                      <th key={h} className="px-5 py-3.5 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allTxns.map(txn => (
                    <tr key={txn.transactionId} className="group transition-colors"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td className="px-5 py-4 text-sm" style={{ color: 'var(--muted)' }}>{formatDate(txn.date)}</td>
                      <td className="px-5 py-4 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                        {txn.description || <span style={{ color: 'var(--muted)', fontWeight: 400 }}>—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                          style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
                          {catMap[txn.categoryId] ?? txn.categoryId}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={txn.type === 'CREDIT' ? 'badge badge-credit' : 'badge badge-debit'}>{txn.type}</span>
                      </td>
                      <td className="px-5 py-4 text-right text-sm font-bold font-mono"
                        style={{ color: txn.type === 'CREDIT' ? 'var(--mint)' : 'var(--red)' }}>
                        {txn.type === 'CREDIT' ? '+' : '−'}{formatAmount(txn.amount)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(txn)}
                            className="p-2 rounded-lg transition-colors"
                            style={{ color: 'var(--muted)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(txn.transactionId)} disabled={deleting === txn.transactionId}
                            className="p-2 rounded-lg transition-colors disabled:opacity-40"
                            style={{ color: 'var(--muted)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
              {allTxns.map(txn => (
                <div key={txn.transactionId} className="p-4">
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{txn.description || '—'}</p>
                    <p className="text-sm font-bold font-mono ml-2 shrink-0" style={{ color: txn.type === 'CREDIT' ? 'var(--mint)' : 'var(--red)' }}>
                      {txn.type === 'CREDIT' ? '+' : '−'}{formatAmount(txn.amount)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>{formatDate(txn.date)}</span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>· {catMap[txn.categoryId] ?? txn.categoryId}</span>
                      <span className={txn.type === 'CREDIT' ? 'badge badge-credit' : 'badge badge-debit'}>{txn.type}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(txn)} style={{ color: 'var(--muted)' }}><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(txn.transactionId)} disabled={deleting === txn.transactionId} style={{ color: 'var(--muted)' }}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {res?.nextCursor && (
              <div className="p-6 flex justify-center border-t" style={{ borderColor: 'var(--border)' }}>
                <button onClick={loadMore} disabled={loading} className="btn btn-ghost text-sm py-2 px-6 rounded-xl border border-dashed border-gray-500/30">
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {modalOpen && (
        <TxnModal txn={editTxn} categories={categories ?? []}
          onClose={() => setModalOpen(false)} onSave={refetch} />
      )}
    </div>
  )
}
