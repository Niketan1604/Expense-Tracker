'use client'
import { useState } from 'react'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'
import { useCategories } from '@/hooks/useApi'
import { categoriesApi } from '@/lib/api'
import ConfirmModal from '@/components/ConfirmModal'
import { useToast } from '@/components/ToastContext'
import type { Category, CreateCategoryBody } from '@/types'

const COLORS = ['#10b77f','#6366f1','#f43f5e','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
const ICONS  = ['🍔','🚗','🏠','💊','✈️','📚','🎮','💰','👕','📱','⚡','🎵','☕','🛒','🎬','💪']

function CatModal({ category, onClose, onSave }: { category?: Category; onClose: () => void; onSave: () => void }) {
  const [name, setName]     = useState(category?.name  ?? '')
  const [icon, setIcon]     = useState(category?.icon  ?? '')
  const [color, setColor]   = useState(category?.color ?? COLORS[0])
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    try {
      const body: CreateCategoryBody = { name, icon: icon || undefined, color }
      category ? await categoriesApi.update(category.categoryId, body) : await categoriesApi.create(body)
      toast.success(category ? 'Category updated' : 'Category created')
      onSave(); onClose()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2 className="modal-title">{category ? 'Edit Category' : 'New Category'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              placeholder="e.g. Groceries" className="fm-input rounded-xl" />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
              Icon <span className="normal-case font-normal opacity-60">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map(ic => (
                <button key={ic} type="button" onClick={() => setIcon(ic === icon ? '' : ic)}
                  className="h-9 w-9 rounded-lg text-lg flex items-center justify-center transition-all hover:scale-110"
                  style={{
                    background: icon === ic ? 'var(--mint-dim)' : 'var(--surface-2)',
                    outline: icon === ic ? '2px solid var(--mint)' : 'none',
                    outlineOffset: '2px',
                  }}>{ic}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full transition-all hover:scale-110"
                  style={{
                    background: c,
                    outline: color === c ? `3px solid ${c}` : 'none',
                    outlineOffset: '3px',
                    transform: color === c ? 'scale(1.15)' : undefined,
                  }} />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1 py-2.5 rounded-xl">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1 py--2.5 rounded-xl">
              {loading ? 'Saving…' : category ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CategoriesPage() {
  const { data: categories, loading, refetch } = useCategories()
  const [modalOpen, setModalOpen]   = useState(false)
  const [editCat, setEditCat]       = useState<Category | undefined>()
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [confirmConfig, setConfirmConfig] = useState<{isOpen: boolean, title?: string, message: string, onConfirm: () => void} | null>(null)
  const toast = useToast()

  const handleDelete = (cat: Category) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Category',
      message: `Are you sure you want to delete "${cat.name}"?`,
      onConfirm: async () => {
        setConfirmConfig(null)
        setDeleting(cat.categoryId)
        try { 
          await categoriesApi.delete(cat.categoryId); 
          toast.success('Category deleted')
          refetch() 
        }
        catch (err) {
          const msg = err instanceof Error ? err.message : ''
          if (msg.includes('409') || msg.toLowerCase().includes('conflict') || msg.toLowerCase().includes('active'))
            toast.error(`Cannot delete "${cat.name}" — it has active transactions. Delete those first.`)
          else
            toast.error('Failed to delete category')
        }
        finally { setDeleting(null) }
      }
    });
  }

  return (
    <>
      <div className="page animate-fadeUp">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="page-title">Categories</h1>
          <p className="page-subtitle">Organise your transactions into groups</p>
        </div>
        <button onClick={() => { setEditCat(undefined); setModalOpen(true) }} className="btn btn-primary rounded-xl self-start md:self-auto">
          <Plus className="w-4 h-4" /> New Category
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}
        </div>
      ) : !categories?.length ? (
        <div className="card empty-state">
          <Tag className="w-10 h-10" strokeWidth={1.5} />
          <p>No categories yet. Create your first one.</p>
          <button onClick={() => setModalOpen(true)} className="btn btn-primary rounded-xl mt-2 text-sm">New Category</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map(cat => (
            <div key={cat.categoryId}
              className="card card-hover group p-5 rounded-2xl"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${cat.color ?? 'var(--mint)'}50` }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: `${cat.color ?? '#10b77f'}15` }}>
                  {cat.icon || <Tag className="w-5 h-5" style={{ color: cat.color ?? 'var(--mint)' }} />}
                </div>
              </div>
              <p className="font-bold text-sm mb-0.5" style={{ color: 'var(--text)' }}>{cat.name}</p>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditCat(cat); setModalOpen(true) }}
                  className="btn btn-ghost flex-1 py-1.5 rounded-lg text-xs">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => handleDelete(cat)} disabled={deleting === cat.categoryId}
                  className="btn btn-ghost flex-1 py-1.5 rounded-lg text-xs disabled:opacity-40"
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}

          {/* Add placeholder */}
          <button onClick={() => { setEditCat(undefined); setModalOpen(true) }}
            className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed cursor-pointer transition-all min-h-[9rem] group"
            style={{ borderColor: 'var(--border)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--mint)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
            <div className="h-11 w-11 rounded-xl flex items-center justify-center mb-2 transition-colors"
              style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
              <Plus className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold" style={{ color: 'var(--muted)' }}>Add New</p>
          </button>
        </div>
      )}
      </div>

      {modalOpen && <CatModal category={editCat} onClose={() => setModalOpen(false)} onSave={refetch} />}

      {confirmConfig && (
        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig(null)}
          confirmText="Yes, Delete"
          cancelText="Cancel"
        />
      )}
    </>
  )
}
