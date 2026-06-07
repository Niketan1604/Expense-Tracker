'use client'
import { useState, Suspense, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronLeft, Plus, Receipt, Users, ReceiptIndianRupee, Settings, LogOut, Trash2, Edit2, Minus } from 'lucide-react'
import { useSplitwiseGroup, useSplitwiseExpenses, useProfile } from '@/hooks/useApi'
import { splitwiseApi } from '@/lib/api'
import { formatAmount, formatDate } from '@/lib/format'
import ConfirmModal from '@/components/ConfirmModal'
import { useToast } from '@/components/ToastContext'
import type { SplitType, UserSplit, SplitwiseGroup, SplitwiseExpense } from '@/types'

function EditGroupModal({ group, currentUserId, onClose, onSave }: { 
  group: SplitwiseGroup,
  currentUserId?: string,
  onClose: () => void, 
  onSave: () => void 
}) {
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || '')
  const [members, setMembers] = useState<{ id?: string; name: string; email: string; expensesCount?: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title?: string, message: string, onConfirm: () => void} | null>(null);
  const router = useRouter()
  const toast = useToast()

  useEffect(() => {
    const fetchExpensesAndInit = async () => {
      try {
        const expenses = await splitwiseApi.getExpenses(group.id)
        let initMembers = group.members.map(m => {
          const count = expenses.filter(e => e.paidByUserId === m.userId || e.shares.some(s => s.userId === m.userId)).length
          return { id: m.userId, name: m.name, email: m.email || '', expensesCount: count }
        })
        
        // Sort so current user is at the bottom
        initMembers.sort((a, b) => {
          const aIsMe = a.id === currentUserId || a.id === group.adminId;
          const bIsMe = b.id === currentUserId || b.id === group.adminId;
          if (aIsMe && !bIsMe) return 1;
          if (!aIsMe && bIsMe) return -1;
          return 0;
        });

        setMembers(initMembers)
      } catch (err) {
        console.error("Failed to fetch expenses for edit modal", err)
      }
    }
    fetchExpensesAndInit()
  }, [group])

  const handleAddMember = () => {
    if (members.length < 10) {
      setMembers([...members, { name: '', email: '' }])
    }
  }

  const handleRemoveMember = (index: number) => {
    const member = members[index]
    if (member.id && member.expensesCount && member.expensesCount > 0) {
      toast.error(`Cannot remove ${member.name}. They are involved in ${member.expensesCount} expenses. Settle or delete them first.`)
      return
    }
    setMembers(members.filter((_, i) => i !== index))
  }

  const performSave = async (membersPayload: any[]) => {
    setLoading(true)
    try {
      await splitwiseApi.updateGroup(group.id, { name, description, members: membersPayload })
      toast.success('Group updated successfully')
      onSave()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to update group')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const names = members.map(m => m.name.trim().toLowerCase())
      const hasDuplicates = names.length !== new Set(names).size
      if (hasDuplicates) throw new Error('Two members cannot have the same name')

      const validMembers = members.filter(m => m.name.trim() !== '')
      if (validMembers.length < 2) throw new Error('A group must have at least 2 members')

      const membersPayload = validMembers.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email
      }))

      // Check for removed existing members
      const removedMembers = group.members.filter(orig => !membersPayload.some(curr => curr.id === orig.userId));
      
      if (removedMembers.length > 0) {
        const namesStr = removedMembers.map(m => m.name).join(', ');
        setConfirmConfig({
          isOpen: true,
          title: 'Remove Member',
          message: `Are you sure you want to remove ${namesStr}? They will lose access to the group.`,
          onConfirm: () => {
            setConfirmConfig(null);
            performSave(membersPayload);
          }
        });
        return;
      }

      performSave(membersPayload);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update group')
    }
  }

  return (
    <div className="modal-overlay z-50">
      <div className="modal-box max-w-md" style={{ height: '80vh', display: 'flex', flexDirection: 'column' }}>
        <h2 className="modal-title">Edit Group</h2>
        <form onSubmit={handleSubmit} className="space-y-4" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              required className="fm-input rounded-xl" />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
              Description <span className="normal-case font-normal opacity-60">(optional)</span>
            </label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              className="fm-input rounded-xl" />
          </div>

          <div className="pt-2 border-t border-border mt-4" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>
                Members ({members.length}/10)
              </label>
            </div>
            
            <div className="space-y-3 overflow-y-auto pr-1" style={{ flex: 1 }}>
              {members.map((member, index) => {
                const isMe = member.id === currentUserId || member.id === group.adminId

                return (
                  <div key={index} className="flex gap-2 items-start bg-surface-2 p-2 rounded-xl">
                    <div className="flex-1 space-y-2 relative group">
                      <input 
                        type="text" 
                        placeholder="Name" 
                        required
                        className="fm-input text-sm rounded-lg py-1.5 px-3 bg-surface" 
                        value={isMe ? `${member.name} (You)` : member.name}
                        onChange={e => {
                          const newMembers = [...members]
                          newMembers[index].name = e.target.value
                          setMembers(newMembers)
                        }}
                        disabled={isMe}
                      />
                      {!isMe && (
                        <input 
                          type="email" 
                          placeholder="Email (optional)" 
                          className="fm-input text-sm rounded-lg py-1.5 px-3 bg-surface" 
                          value={member.email}
                          onChange={e => {
                            const newMembers = [...members]
                            newMembers[index].email = e.target.value
                            setMembers(newMembers)
                          }}
                        />
                      )}
                    </div>
                    
                    {!isMe ? (
                      <button 
                        type="button" 
                        onClick={() => handleRemoveMember(index)}
                        className="p-2 text-red hover:bg-red/10 rounded-lg mt-1 transition-colors"
                        title={member.expensesCount ? `Involved in ${member.expensesCount} expenses` : 'Remove member'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <div className="w-8"></div>
                    )}
                  </div>
                )
              })}

              {/* Add Member button at the bottom of the list */}
              <button 
                type="button" 
                onClick={handleAddMember} 
                disabled={members.length >= 10}
                className="w-full text-xs font-bold text-mint flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed disabled:opacity-50 hover:bg-mint/5 transition-colors"
                style={{ borderColor: 'var(--mint, #4ecdc4)' }}
              >
                <Plus className="w-3.5 h-3.5" /> Add Member
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1 py-2.5 rounded-xl">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1 py-2.5 rounded-xl">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {confirmConfig && (
        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig(null)}
          confirmText="Yes, Remove"
          cancelText="Cancel"
        />
      )}
    </div>
  )
}

function ExpenseModal({ expenseToEdit, currentUserId, groupId, members, onClose, onSave }: { 
  expenseToEdit?: SplitwiseExpense,
  currentUserId?: string,
  groupId: string, 
  members: { userId: string, name: string }[], 
  onClose: () => void, 
  onSave: () => void 
}) {
  const isEditing = !!expenseToEdit
  const [description, setDescription] = useState(expenseToEdit?.description || '')
  const [amount, setAmount] = useState(expenseToEdit?.totalAmount ? expenseToEdit.totalAmount.toString() : '')
  const [paidByUserId, setPaidByUserId] = useState(expenseToEdit?.paidByUserId || currentUserId || members[0]?.userId || '')
  const [splitMode, setSplitMode] = useState<'EQUAL' | 'UNEQUAL'>(expenseToEdit?.splitType === 'EQUAL' || !expenseToEdit ? 'EQUAL' : 'UNEQUAL')
  const [splitType, setSplitType] = useState<SplitType>(expenseToEdit?.splitType === 'EQUAL' ? 'EXACT' : expenseToEdit?.splitType || 'EXACT')
  const toast = useToast()
  
  // Equal split checkbox state
  const [equalSelected, setEqualSelected] = useState<Set<string>>(() => {
    if (expenseToEdit && expenseToEdit.splitType === 'EQUAL') {
      return new Set(expenseToEdit.shares.map(s => s.userId))
    }
    return new Set(members.map(m => m.userId))
  })

  // Unequal split input state
  const [splits, setSplits] = useState<Record<string, { value: string, isManual: boolean }>>(() => {
    const init: Record<string, { value: string, isManual: boolean }> = {}
    if (expenseToEdit && expenseToEdit.splitType !== 'EQUAL') {
      members.forEach(m => {
        const share = expenseToEdit.shares.find(s => s.userId === m.userId)
        init[m.userId] = { value: share ? share.owedAmount.toString() : '0', isManual: true }
      })
    } else {
      members.forEach(m => { init[m.userId] = { value: '', isManual: false } })
    }
    return init
  })

  // When editing % or SHARES, we lost the original user inputs (only the final amount is saved). 
  // Fallback to EXACT so it displays their raw owedAmount correctly.
  useEffect(() => {
    if (expenseToEdit && expenseToEdit.splitType !== 'EQUAL' && expenseToEdit.splitType !== 'EXACT') {
      setSplitType('EXACT')
    }
  }, [expenseToEdit])

  // Auto-calculation engine for Amount and %
  useEffect(() => {
    if (splitMode !== 'UNEQUAL' || splitType === 'SHARES') return

    const total = parseFloat(amount) || 0
    const targetTotal = splitType === 'PERCENTAGE' ? 100 : total

    let manualSum = 0
    let uneditedCount = 0

    members.forEach(m => {
      const s = splits[m.userId]
      if (s?.isManual) manualSum += parseFloat(s.value) || 0
      else uneditedCount++
    })

    const remaining = Math.max(0, targetTotal - manualSum)
    const perUnedited = uneditedCount > 0 ? Number((remaining / uneditedCount).toFixed(2)) : 0

    setSplits(prev => {
      const next = { ...prev }
      let changed = false
      let appliedSum = 0
      let currentUnedited = 0

      members.forEach(m => {
        if (!next[m.userId]?.isManual) {
          currentUnedited++
          
          let newValNum = perUnedited
          if (currentUnedited === uneditedCount) {
            newValNum = Number(Math.max(0, remaining - appliedSum).toFixed(2))
          }
          
          const newVal = newValNum.toString()
          appliedSum += newValNum
          
          if (next[m.userId]?.value !== newVal) {
            next[m.userId] = { value: newVal, isManual: false }
            changed = true
          }
        }
      })
      return changed ? next : prev
    })
  }, [amount, splits, splitMode, splitType, members])

  // Default shares to 1
  useEffect(() => {
    if (splitMode === 'UNEQUAL' && splitType === 'SHARES') {
      setSplits(prev => {
        const next = { ...prev }
        let changed = false
        members.forEach(m => {
          if (!next[m.userId] || next[m.userId].value === '') {
            next[m.userId] = { value: '1', isManual: true }
            changed = true
          }
        })
        return changed ? next : prev
      })
    }
  }, [splitMode, splitType, members])

  const [loading, setLoading] = useState(false)

  const handleSetSplitType = (type: SplitType) => {
    if (splitType !== type) {
      setSplitType(type)
      const init: Record<string, { value: string, isManual: boolean }> = {}
      members.forEach(m => { init[m.userId] = { value: '', isManual: false } })
      setSplits(init)
    }
  }

  const handleSplitChange = (userId: string, val: string) => {
    setSplits(prev => ({ ...prev, [userId]: { value: val, isManual: true } }))
  }

  const adjustShare = (userId: string, delta: number) => {
    setSplits(prev => {
      const current = parseFloat(prev[userId]?.value) || (prev[userId]?.value === '' ? 1 : 0)
      const next = Math.max(0, current + delta)
      return { ...prev, [userId]: { value: next.toString(), isManual: true } }
    })
  }

  const toggleAllEqual = () => {
    if (equalSelected.size === members.length) setEqualSelected(new Set())
    else setEqualSelected(new Set(members.map(m => m.userId)))
  }

  const toggleEqual = (id: string) => {
    const next = new Set(equalSelected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setEqualSelected(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const totalAmount = parseFloat(amount)
      if (isNaN(totalAmount) || totalAmount <= 0) throw new Error("Please enter a valid total amount")
      
      let finalSplits: UserSplit[] = []
      let finalSplitType: SplitType = 'EQUAL'

      if (splitMode === 'EQUAL') {
        if (equalSelected.size === 0) throw new Error("Must select at least one person to split with")
        finalSplitType = 'EQUAL'
        finalSplits = Array.from(equalSelected).map(userId => ({
          userId,
          value: totalAmount / equalSelected.size 
        }))
      } else {
        finalSplitType = splitType
        let sum = 0
        finalSplits = members.map(m => {
          const val = parseFloat(splits[m.userId]?.value || '0')
          if (isNaN(val) || val < 0) throw new Error(`Invalid value for ${m.name}`)
          sum += val
          return { userId: m.userId, value: val }
        })

        if (splitType === 'EXACT') {
          if (Math.abs(sum - totalAmount) > 0.01) {
            throw new Error(`The amounts sum to ${sum.toFixed(2)}, which does not equal the total ${totalAmount.toFixed(2)}`)
          }
        } else if (splitType === 'PERCENTAGE') {
          if (Math.abs(sum - 100) > 0.01) {
            throw new Error(`The percentages sum to ${sum}%, but must equal exactly 100%`)
          }
        } else if (splitType === 'SHARES') {
          if (sum <= 0) {
            throw new Error("Total shares must be greater than 0")
          }
        }
      }

      const payload = {
        groupId,
        description,
        totalAmount,
        currency: 'INR',
        splitType: finalSplitType,
        paidByUserId,
        splits: finalSplits
      }

      if (isEditing) {
        await splitwiseApi.updateExpense(expenseToEdit.id, payload)
        toast.success('Expense updated')
      } else {
        await splitwiseApi.createExpense(payload)
        toast.success('Expense created')
      }
      
      onSave()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to save expense')
    } finally {
      setLoading(false)
    }
  }

  // Calculate total shares to display relative monetary value
  const totalShares = splitMode === 'UNEQUAL' && splitType === 'SHARES' 
    ? members.reduce((sum, m) => sum + (parseFloat(splits[m.userId]?.value) || 0), 0)
    : 0

  return (
    <div className="modal-overlay z-50">
      <div className="modal-box max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="modal-title">{isEditing ? 'Edit Expense' : 'Add Expense'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              required placeholder="e.g. Dinner at Rajdhani" className="fm-input rounded-xl" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Amount</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                required min="0.01" step="0.01" placeholder="0.00" className="fm-input rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Paid By</label>
              <select value={paidByUserId} onChange={e => setPaidByUserId(e.target.value)} required className="fm-input rounded-xl bg-surface">
                {members.map(m => <option key={m.userId} value={m.userId}>{m.name} {m.userId === currentUserId && '(You)'}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Split Strategy</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button type="button" onClick={() => setSplitMode('EQUAL')}
                className="py-2.5 rounded-xl text-sm font-bold transition-all"
                style={splitMode === 'EQUAL'
                  ? { background: 'var(--mint-dim)', color: 'var(--mint)', border: '1.5px solid var(--mint)' }
                  : { background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }
                }>Equally</button>
              <button type="button" onClick={() => setSplitMode('UNEQUAL')}
                className="py-2.5 rounded-xl text-sm font-bold transition-all"
                style={splitMode === 'UNEQUAL'
                  ? { background: 'var(--mint-dim)', color: 'var(--mint)', border: '1.5px solid var(--mint)' }
                  : { background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }
                }>Unequally</button>
            </div>

            {splitMode === 'EQUAL' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {/* Select All row */}
                <button
                  type="button"
                  onClick={toggleAllEqual}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: `1.5px solid ${equalSelected.size === members.length ? 'var(--mint)' : 'var(--border)'}`,
                    background: equalSelected.size === members.length ? 'var(--mint-dim)' : 'var(--surface-2)',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  {/* Custom checkbox */}
                  <span style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    border: `2px solid ${equalSelected.size === members.length ? 'var(--mint)' : 'var(--border)'}`,
                    background: equalSelected.size === members.length ? 'var(--mint)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {equalSelected.size === members.length && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: equalSelected.size === members.length ? 'var(--mint)' : 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {equalSelected.size === members.length ? 'Deselect All' : 'Select All'}
                  </span>
                  {equalSelected.size > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                      {equalSelected.size} selected
                    </span>
                  )}
                </button>

                {/* Member rows */}
                {members.map(m => {
                  const isSelected = equalSelected.has(m.userId)
                  const perPerson = isSelected && equalSelected.size > 0 && parseFloat(amount) > 0
                    ? parseFloat(amount) / equalSelected.size
                    : null
                  const initials = m.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => toggleEqual(m.userId)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: `1.5px solid ${isSelected ? 'var(--mint)' : 'var(--border)'}`,
                        background: isSelected ? 'var(--mint-dim)' : 'var(--surface-2)',
                        cursor: 'pointer',
                        transition: 'all 0.18s ease',
                        width: '100%',
                        textAlign: 'left',
                      }}
                    >
                      {/* Avatar */}
                      <span style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        background: isSelected ? 'var(--mint)' : 'var(--border)',
                        color: isSelected ? '#fff' : 'var(--muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, letterSpacing: '0.02em',
                        transition: 'all 0.18s ease',
                      }}>
                        {initials}
                      </span>

                      {/* Name + you badge */}
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: isSelected ? 'var(--mint)' : 'var(--text)', transition: 'color 0.15s' }}>
                        {m.name}
                        {m.userId === currentUserId && (
                          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--muted)', background: 'var(--border)', borderRadius: 4, padding: '1px 5px' }}>you</span>
                        )}
                      </span>

                      {/* Per-person amount */}
                      {isSelected && perPerson !== null && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mint)', fontVariantNumeric: 'tabular-nums' }}>
                          ₹{perPerson.toFixed(2)}
                        </span>
                      )}

                      {/* Custom checkbox */}
                      <span style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        border: `2px solid ${isSelected ? 'var(--mint)' : 'var(--border)'}`,
                        background: isSelected ? 'var(--mint)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}>
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {splitMode === 'UNEQUAL' && (
              <div className="p-3 bg-surface-2 rounded-xl border border-border">
                <div className="flex gap-2 mb-4 bg-surface p-1 rounded-lg">
                  {(['EXACT', 'PERCENTAGE', 'SHARES'] as SplitType[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleSetSplitType(type)}
                      className={`flex-1 text-[11px] font-bold py-1.5 rounded-md transition-all ${splitType === type ? 'bg-mint text-white shadow-sm' : 'text-muted hover:text-text'}`}
                    >
                      {type === 'EXACT' ? 'Amount' : type === 'PERCENTAGE' ? '%' : 'Shares'}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {members.map(m => {
                    const shareVal = parseFloat(splits[m.userId]?.value) || 0
                    const shareMonetary = totalShares > 0 && parseFloat(amount) > 0 
                      ? (shareVal / totalShares) * parseFloat(amount) 
                      : 0

                    return (
                      <div key={m.userId} className="flex items-center justify-between gap-3 text-sm p-1">
                        <span className="font-semibold truncate max-w-[150px]">{m.name}</span>
                        
                        {splitType === 'SHARES' ? (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted font-mono">{formatAmount(shareMonetary * 100)}</span>
                            <div className="flex items-center bg-surface rounded-lg border border-border">
                              <button type="button" onClick={() => adjustShare(m.userId, -1)} className="p-1.5 hover:bg-surface-2 rounded-l-lg text-muted"><Minus className="w-3 h-3"/></button>
                              <input
                                type="number"
                                min="0"
                                value={splits[m.userId]?.value || ''}
                                onChange={(e) => handleSplitChange(m.userId, e.target.value)}
                                className="w-10 text-center text-sm font-mono bg-transparent border-0 p-0 focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button type="button" onClick={() => adjustShare(m.userId, 1)} className="p-1.5 hover:bg-surface-2 rounded-r-lg text-muted"><Plus className="w-3 h-3"/></button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 w-24 relative group">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0"
                              value={splits[m.userId]?.value || ''}
                              onChange={(e) => handleSplitChange(m.userId, e.target.value)}
                              className={`fm-input py-1 px-2 text-right w-full font-mono bg-surface transition-colors ${!splits[m.userId]?.isManual && amount ? 'text-mint bg-mint/5 border-mint/20' : ''}`}
                            />
                            <span className="text-muted text-xs w-4">
                              {splitType === 'EXACT' ? '₹' : '%'}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-border mt-4">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1 py-2.5 rounded-xl">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1 py-2.5 rounded-xl">
              {loading ? 'Saving...' : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function GroupDetailsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const groupId = searchParams.get('id') || ''

  const { data: group, loading: loadingGroup, refetch: refetchGroup } = useSplitwiseGroup(groupId)
  const { data: expenses, loading: loadingExpenses, refetch: refetchExpenses } = useSplitwiseExpenses(groupId)
  const { data: profile } = useProfile()
  
  const [modalOpen, setModalOpen] = useState(false)
  const [expenseToEdit, setExpenseToEdit] = useState<SplitwiseExpense | undefined>()
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [tab, setTab] = useState<'BALANCES' | 'EXPENSES'>('BALANCES')
  const [isLeaving, setIsLeaving] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title?: string, message: string, onConfirm: () => void} | null>(null);
  const toast = useToast()

  // Critical fix: profile?.userId is a Cognito ID, but group members use Postgres UUIDs.
  // We match by email to find the current user's Postgres ID.
  const myPostgresId = profile?.email 
    ? group?.members.find(m => m.email?.toLowerCase() === profile.email.toLowerCase())?.userId 
    : undefined

  const refreshData = () => {
    refetchGroup()
    refetchExpenses()
  }

  const handleLeaveOrDeleteGroup = () => {
    const isAdmin = profile?.userId === group?.adminId
    const msg = isAdmin 
      ? 'Are you sure you want to delete this group? All expenses will be permanently deleted.'
      : 'Are you sure you want to leave this group? All your expenses will be deleted.'
    
    setConfirmConfig({
      isOpen: true,
      title: isAdmin ? 'Delete Group' : 'Leave Group',
      message: msg,
      onConfirm: async () => {
        setConfirmConfig(null)
        setIsLeaving(true)
        try {
          if (isAdmin) {
            await splitwiseApi.deleteGroup(groupId)
            toast.success('Group deleted')
          } else {
            await splitwiseApi.leaveGroup(groupId)
            toast.success('Left group')
          }
          router.push('/splitwise')
        } catch (err) {
          toast.error('Failed to leave/delete group')
          setIsLeaving(false)
        }
      }
    });
  }

  const handleDeleteExpense = (expenseId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Expense',
      message: 'Are you sure you want to delete this expense?',
      onConfirm: async () => {
        setConfirmConfig(null)
        try {
          await splitwiseApi.deleteExpense(expenseId)
          toast.success('Expense deleted')
          refreshData()
        } catch (err) {
          toast.error('Failed to delete expense')
        }
      }
    });
  }

  if (loadingGroup || !group) {
    return (
      <div className="page animate-fadeUp">
        <div className="skeleton h-8 w-1/3 mb-4 rounded-lg" />
        <div className="skeleton h-24 rounded-2xl mb-8" />
      </div>
    )
  }

  const isAdmin = profile?.userId === group.adminId

  return (
    <>
      <div className="page animate-fadeUp">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <button onClick={() => router.push('/splitwise')} className="text-sm font-semibold text-muted hover:text-text flex items-center gap-1 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back to Groups
          </button>
          
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={() => setEditModalOpen(true)} className="btn btn-ghost py-2 rounded-xl text-sm gap-1">
                <Settings className="w-4 h-4" /> Edit Group
              </button>
            )}
            <button onClick={handleLeaveOrDeleteGroup} disabled={isLeaving} className="btn py-2 rounded-xl text-sm gap-1 text-red hover:bg-red/10 border-0 bg-transparent">
              {isAdmin ? <Trash2 className="w-4 h-4" /> : <LogOut className="w-4 h-4" />} 
              {isLeaving ? '...' : (isAdmin ? 'Delete Group' : 'Leave')}
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="page-title flex items-center gap-2">
              {group.name} 
              {isAdmin && <span className="text-[10px] uppercase tracking-widest bg-mint/10 text-mint px-2 py-0.5 rounded-full">Admin</span>}
            </h1>
            {group.description && <p className="page-subtitle mt-1">{group.description}</p>}
          </div>
          <button onClick={() => { setExpenseToEdit(undefined); setModalOpen(true); }} className="btn btn-primary rounded-xl self-start sm:self-auto shrink-0">
            <Plus className="w-4 h-4" /> Add Expense
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 bg-surface-2 rounded-xl w-fit">
          <button onClick={() => setTab('BALANCES')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'BALANCES' ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'}`}>
            Balances
          </button>
          <button onClick={() => setTab('EXPENSES')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'EXPENSES' ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'}`}>
            Expenses
          </button>
        </div>

        {/* Tab Content */}
        {tab === 'BALANCES' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {group.members.map(member => (
              <div key={member.userId} className="card p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center font-bold text-text shrink-0">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-text">
                      {member.name} {member.userId === profile?.userId && '(You)'}
                      {member.userId === group.adminId && <span className="ml-2 text-[10px] uppercase tracking-widest text-mint">Admin</span>}
                    </p>
                    {member.email && <p className="text-xs text-muted truncate max-w-[180px]">{member.email}</p>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted mb-0.5">Net Balance</p>
                  <p className={`font-bold font-mono ${member.netBalance > 0 ? 'text-mint' : member.netBalance < 0 ? 'text-red' : 'text-muted'}`}>
                    {member.netBalance > 0 ? '+' : member.netBalance < 0 ? '−' : ''}
                    {formatAmount(Math.abs(member.netBalance) * 100)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'EXPENSES' && (
          <div className="card overflow-hidden">
            {loadingExpenses ? (
              <div className="p-4"><div className="skeleton h-16 rounded-xl" /></div>
            ) : !expenses?.length ? (
              <div className="empty-state py-12">
                <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-4 text-muted">
                  <Receipt className="w-6 h-6" />
                </div>
                <p>No expenses in this group yet.</p>
                <button onClick={() => { setExpenseToEdit(undefined); setModalOpen(true); }} className="text-mint font-semibold text-sm mt-2">Add the first expense</button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {expenses.map(exp => (
                  <div key={exp.id} className="p-4 flex items-center justify-between hover:bg-surface-2 transition-colors group">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-muted shrink-0 border border-border">
                        <ReceiptIndianRupee className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-text leading-tight">{exp.description}</p>
                        <p className="text-xs text-muted mt-1">
                          {formatDate(exp.createdAt.split('T')[0])} • Paid by {exp.paidByUserName === profile?.name ? 'You' : exp.paidByUserName}
                        </p>
                        {exp.updatedAt && (
                          <p className="text-[10px] text-muted/60 mt-0.5">
                            Last modified by {exp.updatedByUserName} on {formatDate(exp.updatedAt.split('T')[0])}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-4">
                      <p className="font-bold font-mono text-text">
                        {formatAmount(exp.totalAmount * 100)}
                      </p>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => { setExpenseToEdit(exp); setModalOpen(true); }}
                          className="p-2 text-muted hover:text-mint hover:bg-mint/10 rounded-lg transition-colors"
                          title="Edit Expense"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="p-2 text-muted hover:text-red hover:bg-red/10 rounded-lg transition-colors"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <ExpenseModal 
          expenseToEdit={expenseToEdit}
          currentUserId={myPostgresId}
          groupId={groupId} 
          members={group.members} 
          onClose={() => { setModalOpen(false); setExpenseToEdit(undefined); }} 
          onSave={refreshData} 
        />
      )}

      {editModalOpen && (
        <EditGroupModal 
          group={group}
          currentUserId={myPostgresId}
          onClose={() => setEditModalOpen(false)} 
          onSave={refreshData} 
        />
      )}

      {confirmConfig && (
        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig(null)}
          confirmText="Yes, Proceed"
          cancelText="Cancel"
        />
      )}
    </>
  )
}

export default function GroupDetailsPage() {
  return (
    <Suspense fallback={<div className="page animate-fadeUp"><div className="skeleton h-8 w-1/3 mb-4 rounded-lg" /><div className="skeleton h-24 rounded-2xl mb-8" /></div>}>
      <GroupDetailsContent />
    </Suspense>
  )
}
