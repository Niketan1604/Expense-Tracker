'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import { useSplitwiseGroups, useProfile } from '@/hooks/useApi'
import { formatAmount } from '@/lib/format'
import { useToast } from '@/components/ToastContext'

function CreateGroupModal({ onClose, onSave }: { onClose: () => void, onSave: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [members, setMembers] = useState<{ name: string; email: string }[]>([])
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const handleAddMember = () => {
    if (members.length < 9) {
      setMembers([...members, { name: '', email: '' }])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      // Basic validation
      for (const m of members) {
        if (!m.name.trim()) throw new Error('All members must have a name')
      }
      // Duplicate name check
      const names = members.map(m => m.name.trim().toLowerCase())
      const hasDuplicates = names.length !== new Set(names).size
      if (hasDuplicates) throw new Error('Two members cannot have the same name')

      const validMembers = members.filter(m => m.name.trim() !== '')
      if (validMembers.length < 1) throw new Error('A group must have at least 2 members (you and 1 other)')

      const { splitwiseApi } = await import('@/lib/api')
      await splitwiseApi.createGroup({ name, description, members: validMembers })
      toast.success('Group created successfully')
      onSave()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create group')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box max-w-md" style={{ height: '80vh', display: 'flex', flexDirection: 'column' }}>
        <h2 className="modal-title">Create Group</h2>
        <form onSubmit={handleSubmit} className="space-y-4" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              required placeholder="e.g. Goa Trip" className="fm-input rounded-xl" />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
              Description <span className="normal-case font-normal opacity-60">(optional)</span>
            </label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Expenses for our December trip" className="fm-input rounded-xl" />
          </div>

          <div className="pt-2 border-t border-border mt-4" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>
                Members ({members.length + 1}/10)
              </label>
            </div>
            
            <div className="space-y-3 overflow-y-auto pr-1" style={{ flex: 1 }}>
              {members.length === 0 && (
                <p className="text-xs text-muted pb-1">You will automatically be added to this group.</p>
              )}
              {members.map((member, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <input 
                      type="text" 
                      placeholder="Name" 
                      required
                      className="fm-input text-sm rounded-lg py-1.5 px-3" 
                      value={member.name}
                      onChange={e => {
                        const newMembers = [...members]
                        newMembers[index].name = e.target.value
                        setMembers(newMembers)
                      }}
                    />
                    <input 
                      type="email" 
                      placeholder="Email (optional)" 
                      className="fm-input text-sm rounded-lg py-1.5 px-3" 
                      value={member.email}
                      onChange={e => {
                        const newMembers = [...members]
                        newMembers[index].email = e.target.value
                        setMembers(newMembers)
                      }}
                    />
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setMembers(members.filter((_, i) => i !== index))}
                    className="p-2 text-red hover:bg-red/10 rounded-lg mt-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
              ))}

              {/* Add Member button at bottom of list */}
              <button 
                type="button" 
                onClick={handleAddMember} 
                disabled={members.length >= 9}
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
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SplitwisePage() {
  const { data: groups, loading, refetch } = useSplitwiseGroups()
  const { data: profile } = useProfile()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="page animate-fadeUp">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="page-title">Splitwise Groups</h1>
            <p className="page-subtitle">Split expenses with friends and family</p>
          </div>
          <button onClick={() => setModalOpen(true)} className="btn btn-primary rounded-xl self-start sm:self-auto">
            <Plus className="w-4 h-4" /> New Group
          </button>
        </div>

        {/* Groups Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            [...Array(3)].map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)
          ) : !groups?.length ? (
            <div className="col-span-full empty-state py-12">
              <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-4 text-muted">
                <Users className="w-6 h-6" />
              </div>
              <p>You are not in any groups yet.</p>
              <button onClick={() => setModalOpen(true)} className="btn btn-outline rounded-xl mt-4">
                Create your first group
              </button>
            </div>
          ) : (
            groups.map(group => {
              return (
                <Link key={group.id} href={`/splitwise/group?id=${group.id}`} className="card p-5 card-hover block">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-text leading-tight">{group.name}</h3>
                        <p className="text-xs text-muted mt-0.5">{group.members.length} members</p>
                      </div>
                    </div>
                  </div>
                  
                  {group.description && (
                    <p className="text-sm text-muted mb-4 line-clamp-2">{group.description}</p>
                  )}
                </Link>
              )
            })
          )}
        </div>
      </div>
      
      {modalOpen && (
        <CreateGroupModal onClose={() => setModalOpen(false)} onSave={refetch} />
      )}
    </>
  )
}
