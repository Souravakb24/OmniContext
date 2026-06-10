import React, { useState, useEffect } from 'react'
import * as api from '../api.js'
import Modal from './Modal.jsx'
import { useToast } from './Toast.jsx'

const Icon = ({ d, size = 14 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7"><path d={d}/></svg>
)

const DotsIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
    <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
  </svg>
)

function menuPosition(r, menuW = 170, menuH = 130) {
  let left = r.left
  let top = r.bottom + 4
  if (left + menuW > window.innerWidth - 8) left = r.right - menuW
  if (top + menuH > window.innerHeight - 8) top = r.top - menuH - 4
  return { top: Math.max(8, top), left: Math.max(8, left) }
}

export default function CollectionsGrid() {
  const [collections, setCollections] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  // create
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState('')

  // delete
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // rename
  const [renameModal, setRenameModal] = useState(null)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameErr, setRenameErr] = useState('')

  // edit description
  const [descModal, setDescModal] = useState(null)
  const [descValue, setDescValue] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)

  // dropdown menu
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

  const showToast = useToast()

  const fetchData = async () => {
    setLoading(true)
    try {
      const [cols, st] = await Promise.all([api.getAdminCollections(), api.getOrgStats()])
      setCollections(cols)
      setStats(st)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const openMenu = (c, e) => {
    e.stopPropagation()
    const pos = menuPosition(e.currentTarget.getBoundingClientRect())
    setMenuPos(pos)
    setMenuOpenId(prev => prev === c.collection_id ? null : c.collection_id)
  }

  const create = async () => {
    if (!name.trim()) return
    setCreateErr('')
    setCreating(true)
    try {
      await api.createCollection(name.trim(), desc.trim())
      setName(''); setDesc(''); setOpen(false)
      showToast('Collection created.')
      await fetchData()
    } catch (err) {
      setCreateErr(
        err.status === 409 ? 'A collection with that name already exists.' :
        err.status === 429 ? 'Collection limit reached.' :
        err.message || 'Something went wrong.'
      )
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await api.deleteCollection(deleteConfirm.collection_id)
      setCollections(prev => prev.filter(c => c.collection_id !== deleteConfirm.collection_id))
      setDeleteConfirm(null)
      showToast('Collection deleted.')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleRename = async () => {
    if (!renameModal || !renameName.trim()) return
    setRenameErr('')
    setRenaming(true)
    try {
      const res = await api.renameCollection(renameModal.collection_id, renameName.trim())
      setCollections(prev => prev.map(c => c.collection_id === res.collection_id ? { ...c, name: res.name } : c))
      setRenameModal(null)
      showToast('Collection renamed.')
    } catch (err) {
      setRenameErr(err.status === 409 ? 'Name already taken.' : err.message || 'Failed.')
    } finally {
      setRenaming(false)
    }
  }

  const handleDescSave = async () => {
    if (!descModal) return
    setSavingDesc(true)
    try {
      const res = await api.updateCollectionDescription(descModal.collection_id, descValue.trim())
      setCollections(prev => prev.map(c => c.collection_id === res.collection_id ? { ...c, description: res.description } : c))
      setDescModal(null)
      showToast('Description updated.')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSavingDesc(false)
    }
  }

  const openRename = (c) => { setRenameModal(c); setRenameName(c.name); setRenameErr(''); setMenuOpenId(null) }
  const openDesc   = (c) => { setDescModal(c); setDescValue(c.description || ''); setMenuOpenId(null) }

  const usedCols = stats?.limits?.collections?.used ?? collections.length
  const limitCols = stats?.limits?.collections?.limit ?? '?'

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Collections</h2>
          <p className="quiet">{usedCols} of {limitCols} used</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <Icon d="M12 5v14M5 12h14" />
          New collection
        </button>
      </div>

      {loading ? (
        <p className="quiet">Loading…</p>
      ) : (
        <div className="collections-grid">
          {collections.map(c => (
            <article key={c.collection_id} className="coll-card">
              <header className="coll-card-head">
                <div className="coll-card-title">
                  <h3>{c.name}</h3>
                  <p>{c.description || 'No description.'}</p>
                </div>
                <div className="coll-card-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="icon-btn conv-dots"
                    title="Options"
                    onClick={e => openMenu(c, e)}
                  >
                    <DotsIcon />
                  </button>
                </div>
              </header>
              <dl className="coll-stats">
                <div><dt>Documents</dt><dd>{c.doc_count} <span className="quiet">/ {stats?.limits?.collections?.limit ?? '?'}</span></dd></div>
                <div><dt>Created</dt><dd>{new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</dd></div>
              </dl>
              <footer className="coll-card-foot">
                <span className="quiet">{c.doc_count === 0 ? 'Empty' : `${c.doc_count} docs indexed`}</span>
              </footer>
            </article>
          ))}
          {collections.length === 0 && (
            <p className="quiet">No collections yet. Create one to start uploading documents.</p>
          )}
        </div>
      )}

      {/* Fixed dropdown menu */}
      {menuOpenId && (
        <>
          <div className="conv-menu-scrim" onClick={() => setMenuOpenId(null)} />
          <div className="conv-menu" style={{ top: menuPos.top, left: menuPos.left }}>
            <button className="conv-menu-item" onClick={() => {
              const c = collections.find(c => c.collection_id === menuOpenId)
              if (c) openRename(c)
            }}>
              <Icon d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" size={13} />
              Rename
            </button>
            <button className="conv-menu-item" onClick={() => {
              const c = collections.find(c => c.collection_id === menuOpenId)
              if (c) openDesc(c)
            }}>
              <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" size={13} />
              Edit description
            </button>
            <button className="conv-menu-item conv-menu-danger" onClick={() => {
              const c = collections.find(c => c.collection_id === menuOpenId)
              if (c) { setDeleteConfirm(c); setMenuOpenId(null) }
            }}>
              <Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" size={13} />
              Delete
            </button>
          </div>
        </>
      )}

      {/* Create collection */}
      <Modal
        open={open}
        onClose={() => { setOpen(false); setCreateErr('') }}
        title="New collection"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setOpen(false); setCreateErr('') }}>Cancel</button>
            <button className="btn btn-primary" disabled={creating || !name.trim()} onClick={create}>
              {creating ? 'Creating…' : 'Create collection'}
            </button>
          </>
        }
      >
        {createErr && <p style={{ color: 'var(--ember)', font: '400 13px var(--font-sans)', margin: 0 }}>{createErr}</p>}
        <label className="field">
          <span className="field-label">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="research-papers" autoFocus />
          <span className="quiet">Lowercase, hyphens, no spaces.</span>
        </label>
        <label className="field">
          <span className="field-label">Description</span>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="One line. What lives here?" rows={3} />
        </label>
      </Modal>

      {/* Delete collection */}
      {deleteConfirm && (
        <>
          <div className="modal-scrim" onClick={() => setDeleteConfirm(null)} />
          <div className="modal modal-danger" role="dialog">
            <header className="modal-head"><h3>Delete collection?</h3></header>
            <div className="modal-body">
              <p><b>{deleteConfirm.name}</b> and all <b>{deleteConfirm.doc_count}</b> document{deleteConfirm.doc_count !== 1 ? 's' : ''} inside it will be permanently deleted.</p>
              <p className="quiet">This cannot be undone.</p>
            </div>
            <footer className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={deleting} onClick={handleDelete}>{deleting ? 'Deleting…' : 'Delete collection'}</button>
            </footer>
          </div>
        </>
      )}

      {/* Rename collection */}
      <Modal
        open={!!renameModal}
        onClose={() => setRenameModal(null)}
        title="Rename collection"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRenameModal(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={renaming || !renameName.trim()} onClick={handleRename}>
              {renaming ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        {renameErr && <p style={{ color: 'var(--ember)', font: '400 13px var(--font-sans)', margin: 0 }}>{renameErr}</p>}
        <label className="field">
          <span className="field-label">New name</span>
          <input value={renameName} onChange={e => setRenameName(e.target.value)} autoFocus
            onKeyDown={e => e.key === 'Enter' && handleRename()} />
        </label>
      </Modal>

      {/* Edit description */}
      <Modal
        open={!!descModal}
        onClose={() => setDescModal(null)}
        title="Edit description"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDescModal(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={savingDesc} onClick={handleDescSave}>
              {savingDesc ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">Description</span>
          <textarea value={descValue} onChange={e => setDescValue(e.target.value)} rows={3} autoFocus />
        </label>
      </Modal>
    </>
  )
}
