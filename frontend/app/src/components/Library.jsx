import React, { useState, useEffect, useRef, useCallback } from 'react'
import * as api from '../api.js'
import { useToast } from './Toast.jsx'

const PIPELINE = ['QUEUED', 'CONVERTING', 'PARSING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'COMPLETED']
const TERMINAL = ['COMPLETED', 'FAILED']

function normalizeStatus(s) {
  if (s === 'COMPLETED') return 'Ready'
  return s.charAt(0) + s.slice(1).toLowerCase()
}

function fmtSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = (new Date() - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) > 1 ? 's' : ''} ago`
}

// Clamp dropdown position so it never goes off screen
function menuPosition(r, menuW = 170, menuH = 120) {
  let left = r.left
  let top = r.bottom + 4
  if (left + menuW > window.innerWidth - 8) left = r.right - menuW
  if (top + menuH > window.innerHeight - 8) top = r.top - menuH - 4
  return { top: Math.max(8, top), left: Math.max(8, left) }
}

export const FileIcon = ({ ext, size = 22 }) => {
  const e = (ext || 'pdf').replace('.', '').toLowerCase()
  const color = e === 'pdf' ? '#C24A3A' : e === 'docx' || e === 'doc' ? '#2E6F8E' : '#D9B271'
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden style={{ flexShrink: 0 }}>
      <path d="M8 4 h12 l6 6 v18 a2 2 0 0 1 -2 2 H8 a2 2 0 0 1 -2 -2 V6 a2 2 0 0 1 2 -2 z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M20 4 v6 h6" fill="none" style={{ stroke: 'var(--current)' }} strokeWidth="1.5" strokeLinejoin="round"/>
      <text x="16" y="24" textAnchor="middle" fontFamily="Geist, sans-serif" fontSize="6.5" fontWeight="600" fill={color}>{e.toUpperCase().slice(0, 3)}</text>
    </svg>
  )
}

const Icon = ({ d, size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6"><path d={d}/></svg>
)

const DotsIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
    <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
  </svg>
)

function PipelineDialog({ doc, onClose }) {
  const status = doc.status
  const activeIdx = PIPELINE.indexOf(status)
  const isDone = status === 'COMPLETED'
  const isFailed = status === 'FAILED'

  return (
    <>
      <div className="modal-scrim" onClick={onClose} />
      <div className="modal pipeline-dialog" role="dialog" aria-modal="true">
        <header className="modal-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h3 style={{ margin: 0 }}>Ingestion progress</h3>
            <span className="quiet" style={{ fontSize: 12 }}>{doc.filename}</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </header>

        <div className="modal-body" style={{ paddingBottom: 24 }}>
          {(() => {
            const total = PIPELINE.length
            const pct = isDone ? 100
              : isFailed ? Math.max(4, Math.round((activeIdx / (total - 1)) * 100))
              : Math.max(4, Math.round((Math.max(activeIdx, 0) / (total - 1)) * 100))
            const tone  = isFailed ? 'failed' : isDone ? 'done' : 'active'
            const label = isFailed ? 'Failed' : isDone ? 'Ready' : 'Processing…'
            return (
              <div className="pf-bar-wrap">
                <div className="pf-bar-row">
                  <span className={`pf-bar-label pf-bar-label-${tone}`}>{label}</span>
                  <span className="pf-bar-pct quiet">{pct}%</span>
                </div>
                <div className="pf-bar">
                  <div
                    className={`pf-bar-fill pf-bar-fill-${tone}${tone === 'active' ? ' is-anim' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })()}

          {isFailed && doc.error_message && (
            <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--ember-soft)', borderRadius: 8 }}>
              <p style={{ margin: 0, font: '400 13px var(--font-sans)', color: 'var(--ember)' }}>
                <b>Error:</b> {doc.error_message}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export const StatusPill = ({ status, onClick }) => {
  const display = normalizeStatus(status)
  const map = {
    'Ready':      { c: 'moss' },
    'Embedding':  { c: 'current', pulse: true },
    'Indexing':   { c: 'current', pulse: true },
    'Converting': { c: 'current', pulse: true },
    'Parsing':    { c: 'current', pulse: true },
    'Chunking':   { c: 'current', pulse: true },
    'Queued':     { c: 'neutral' },
    'Uploaded':   { c: 'neutral' },
    'Failed':     { c: 'ember' },
  }
  const m = map[display] || { c: 'neutral' }
  return (
    <button className={`pill pill-tile pill-${m.c} pill-btn`} onClick={onClick} title="Click to see pipeline detail">
      <span className={`pill-dot ${m.pulse ? 'pulse' : ''}`} />
      {display}
    </button>
  )
}

// ─── Tag editor modal ─────────────────────────────────────────────────────────

function TagEditor({ doc, onClose, onSaved }) {
  const [tags, setTags] = useState(doc.tags || [])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  const addTag = () => {
    const t = input.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setInput('')
  }
  const removeTag = (t) => setTags(prev => prev.filter(x => x !== t))
  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }

  const save = async () => {
    setSaving(true)
    try {
      await api.updateDocumentTags(doc.doc_id, tags)
      onSaved(doc.doc_id, tags)
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="modal-scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <header className="modal-head">
          <h3>Edit tags</h3>
          <button className="icon-btn" onClick={onClose}><Icon d="M6 6l12 12M18 6 6 18" /></button>
        </header>
        <div className="modal-body">
          <p className="quiet" style={{ fontSize: 13 }}>{doc.filename}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 32 }}>
            {tags.map(t => (
              <span key={t} className="pill pill-neutral" style={{ fontSize: 12 }}>
                {t}
                <button onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 4px', color: 'var(--ink-3)', lineHeight: 1 }}>×</button>
              </span>
            ))}
            {tags.length === 0 && <span className="quiet" style={{ fontSize: 12 }}>No tags yet.</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Add tag and press Enter"
              style={{ flex: 1 }}
              autoFocus
            />
            <button className="btn btn-secondary btn-sm" onClick={addTag}>Add</button>
          </div>
        </div>
        <footer className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save tags'}</button>
        </footer>
      </div>
    </>
  )
}

// ─── Collection detail: list-view row ────────────────────────────────────────

function DocListRow({ d, summary, onPipeline, onMenu, selected, onToggle }) {
  const [expanded, setExpanded] = useState(false)
  const rowRef = useRef(null)
  const ext = (d.original_extension || 'pdf').replace('.', '')
  const hasSummary = !!summary?.summary

  useEffect(() => {
    if (!expanded) return
    const handler = (e) => {
      if (rowRef.current && !rowRef.current.contains(e.target)) setExpanded(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [expanded])

  return (
    <div
      ref={rowRef}
      className={`cdoc-row ${expanded ? 'expanded' : ''} ${hasSummary ? 'clickable' : ''} ${selected ? 'is-selected' : ''}`}
      onClick={() => hasSummary && setExpanded(e => !e)}
    >
      <span className="cdoc-check" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
        />
      </span>
      <span className="cdoc-icon"><FileIcon ext={ext} size={24} /></span>
      <span className="cdoc-info">
        <span className="cdoc-name-row">
          <b className="cdoc-name">{d.filename}</b>
          {summary?.assigned_domain && (
            <span className="cdoc-domain">{summary.assigned_domain}</span>
          )}
        </span>
        {hasSummary ? (
          <p className={`cdoc-summary ${expanded ? 'cdoc-summary-full' : ''}`}>
            {summary.summary}
          </p>
        ) : (
          <span className="quiet cdoc-meta">
            {fmtSize(d.size_bytes)} · {fmtDate(d.created_at)}
          </span>
        )}
      </span>
      <span className="cdoc-row-right" onClick={e => e.stopPropagation()}>
        <span className="cdoc-status-col">
          <StatusPill status={d.status} onClick={() => onPipeline(d.doc_id)} />
          {d.error_message && (
            <span className="cdoc-error-msg" title={d.error_message}>{d.error_message}</span>
          )}
        </span>
        <span className="cdoc-row-actions">
          <button
            className="icon-btn conv-dots"
            title="Options"
            onClick={e => { e.stopPropagation(); onMenu(e) }}
          >
            <DotsIcon />
          </button>
        </span>
        {hasSummary && (
          <svg className={`cdoc-chevron ${expanded ? 'open' : ''}`} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        )}
      </span>
    </div>
  )
}

// ─── Collection detail: grid-view card ───────────────────────────────────────

function DocGridCard({ d, summary, onPipeline, onMenu }) {
  const [expanded, setExpanded] = useState(false)
  const ext = (d.original_extension || 'pdf').replace('.', '')
  return (
    <div className={`cdoc-card ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded(e => !e)}>
      <div className="cdoc-card-main">
        <FileIcon ext={ext} size={30} />
        <span className="cdoc-card-name">{d.filename}</span>
        {summary?.assigned_domain && (
          <span className="cdoc-domain">{summary.assigned_domain}</span>
        )}
      </div>
      {expanded && (
        <div className="cdoc-card-expand" onClick={e => e.stopPropagation()}>
          {summary?.summary
            ? <p className="cdoc-summary">{summary.summary}</p>
            : <span className="quiet">{fmtSize(d.size_bytes)} · {fmtDate(d.created_at)}</span>
          }
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <StatusPill status={d.status} onClick={() => onPipeline(d.doc_id)} />
            <button
              className="icon-btn conv-dots"
              title="Options"
              onClick={e => { e.stopPropagation(); onMenu(e) }}
            >
              <DotsIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Collection detail page ───────────────────────────────────────────────────

function CollectionDetail({ col, docs, onBack, onUpload, onAsk, docView, setDocView, onPipeline, onMenu, selected, onToggle, onBulkDeleteConfirm, bulkDeleting }) {
  const [summaries, setSummaries] = useState({})

  useEffect(() => {
    const completedDocs = docs.filter(d => d.status === 'COMPLETED')
    completedDocs.forEach(d => {
      if (summaries[d.doc_id]) return
      api.getDocSummary(d.doc_id)
        .then(data => setSummaries(prev => ({ ...prev, [d.doc_id]: data })))
        .catch(() => {})
    })
  }, [docs])

  const allSelected = docs.length > 0 && docs.every(d => selected.has(d.doc_id))

  const toggleAll = (e) => {
    if (e.target.checked) {
      docs.forEach(d => onToggle(d.doc_id, true))
    } else {
      docs.forEach(d => onToggle(d.doc_id, false))
    }
  }

  return (
    <div className="col-detail">
      <div className="col-detail-head">
        <div className="col-detail-breadcrumb">
          <button className="col-back-btn" onClick={onBack}>
            <Icon d="M15 18l-6-6 6-6" size={15} /> Collections
          </button>
          <span className="col-sep">/</span>
          <span className="col-detail-title">{col.name}</span>
        </div>
        <div className="col-detail-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => onUpload(col.name)}>
            <Icon d="M12 16V4M6 10l6-6 6 6M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" size={14} />
            Upload
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onAsk(col.name)}>
            <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" size={14} />
            Ask
          </button>
          <div className="view-toggle">
            <button className={`view-btn ${docView === 'list' ? 'active' : ''}`} onClick={() => setDocView('list')} title="List view">
              <Icon d="M3 6h18M3 12h18M3 18h18" size={15} />
            </button>
            <button className={`view-btn ${docView === 'grid' ? 'active' : ''}`} onClick={() => setDocView('grid')} title="Grid view">
              <Icon d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" size={15} />
            </button>
          </div>
        </div>
      </div>

      {col.description && <p className="col-detail-desc">{col.description}</p>}

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="quiet">{selected.size} selected</span>
          <button className="btn btn-danger btn-sm" disabled={bulkDeleting} onClick={onBulkDeleteConfirm}>
            <Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" size={13} />
            {`Delete ${selected.size}`}
          </button>
          <button className="link link-quiet" onClick={() => docs.forEach(d => onToggle(d.doc_id, false))}>Clear selection</button>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="col-detail-empty">
          <p className="quiet">No documents in this collection yet.</p>
          <button className="btn btn-primary btn-sm" onClick={() => onUpload(col.name)}>Upload first document</button>
        </div>
      ) : docView === 'list' ? (
        <div className="cdoc-list">
          <div className="cdoc-list-head">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ width: 14, height: 14, cursor: 'pointer' }}
              title="Select all"
            />
            <span className="quiet" style={{ fontSize: 12 }}>Document</span>
          </div>
          {docs.map(d => (
            <DocListRow
              key={d.doc_id}
              d={d}
              summary={summaries[d.doc_id]}
              onPipeline={onPipeline}
              onMenu={e => onMenu(d.doc_id, e)}
              selected={selected.has(d.doc_id)}
              onToggle={() => onToggle(d.doc_id)}
            />
          ))}
        </div>
      ) : (
        <div className="cdoc-grid">
          {docs.map(d => (
            <DocGridCard
              key={d.doc_id}
              d={d}
              summary={summaries[d.doc_id]}
              onPipeline={onPipeline}
              onMenu={e => onMenu(d.doc_id, e)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Library ─────────────────────────────────────────────────────────────

export default function Library({ onUpload, onAsk, refreshTick }) {
  const showToast = useToast()
  const [collections, setCollections] = useState([])
  const [documents, setDocuments] = useState([])
  const [retrying, setRetrying] = useState(null)
  const [pipelineDoc, setPipelineDoc] = useState(null)
  const [selectedCollection, setSelectedCollection] = useState(null)
  const [docView, setDocView] = useState('list')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [tagDoc, setTagDoc] = useState(null)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

  const fetchData = useCallback(async () => {
    try {
      const [cols, docs] = await Promise.all([
        api.getMyCollections(),
        api.getMyDocuments(),
      ])
      setCollections(cols)
      setDocuments(docs)
    } catch {}
  }, [])

  useEffect(() => { fetchData() }, [fetchData, refreshTick])

  useEffect(() => {
    const id = setInterval(fetchData, 10000)
    return () => clearInterval(id)
  }, [fetchData])

  // Clear selection when switching collections
  useEffect(() => { setSelected(new Set()) }, [selectedCollection])

  const openDocMenu = (doc_id, e) => {
    const pos = menuPosition(e.currentTarget.getBoundingClientRect())
    setMenuPos(pos)
    setMenuOpenId(prev => prev === doc_id ? null : doc_id)
  }

  const handleToggle = (doc_id, forceTo) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (forceTo === true) n.add(doc_id)
      else if (forceTo === false) n.delete(doc_id)
      else n.has(doc_id) ? n.delete(doc_id) : n.add(doc_id)
      return n
    })
  }

  const handleRetry = async (doc_id) => {
    setRetrying(doc_id)
    try {
      await api.retryDocument(doc_id)
      setDocuments(prev => prev.map(d =>
        d.doc_id === doc_id ? { ...d, status: 'QUEUED', error_message: null } : d
      ))
      showToast('Document re-queued for ingestion.')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setRetrying(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await api.deleteDocument(deleteConfirm.doc_id)
      setDocuments(prev => prev.filter(d => d.doc_id !== deleteConfirm.doc_id))
      setSelected(prev => { const n = new Set(prev); n.delete(deleteConfirm.doc_id); return n })
      setDeleteConfirm(null)
      showToast('Document deleted.')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleBulkDelete = async () => {
    if (!selected.size) return
    setBulkDeleting(true)
    try {
      const doc_ids = [...selected]
      const res = await api.deleteDocuments(doc_ids)
      setDocuments(prev => prev.filter(d => !res.deleted.includes(d.doc_id)))
      showToast(`${res.deleted.length} document${res.deleted.length !== 1 ? 's' : ''} deleted.`)
      setSelected(new Set())
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBulkDeleting(false)
      setBulkDeleteConfirm(false)
    }
  }

  const handleTagsSaved = (doc_id, tags) => {
    setDocuments(prev => prev.map(d => d.doc_id === doc_id ? { ...d, tags } : d))
    showToast('Tags saved.')
  }

  const liveSelectedCol = selectedCollection
    ? collections.find(c => c.collection_id === selectedCollection.collection_id) || selectedCollection
    : null

  const collectionDocs = liveSelectedCol
    ? documents.filter(d => d.collection_name === liveSelectedCol.name || d.collection_id === liveSelectedCol.collection_id)
    : []

  const activeCount = documents.filter(d => !TERMINAL.includes(d.status)).length

  // ── Shared dropdown menu + modals ──
  const docMenu = menuOpenId && (
    <>
      <div className="conv-menu-scrim" onClick={() => setMenuOpenId(null)} />
      <div className="conv-menu" style={{ top: menuPos.top, left: menuPos.left }}>
        <button className="conv-menu-item" onClick={() => {
          const doc = documents.find(d => d.doc_id === menuOpenId)
          if (doc) { setTagDoc(doc); setMenuOpenId(null) }
        }}>
          <Icon d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01" size={13} />
          Edit tags
        </button>
        <button className="conv-menu-item conv-menu-danger" onClick={() => {
          const doc = documents.find(d => d.doc_id === menuOpenId)
          if (doc) { setDeleteConfirm(doc); setMenuOpenId(null) }
        }}>
          <Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" size={13} />
          Delete
        </button>
      </div>
    </>
  )

  const sharedModals = (
    <>
      {deleteConfirm && (
        <>
          <div className="modal-scrim" onClick={() => setDeleteConfirm(null)} />
          <div className="modal modal-danger" role="dialog">
            <header className="modal-head"><h3>Delete document?</h3></header>
            <div className="modal-body">
              <p><b>{deleteConfirm.filename}</b> will be permanently removed and can't be recovered.</p>
              <p className="quiet">This cannot be undone.</p>
            </div>
            <footer className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={deleting} onClick={handleDelete}>{deleting ? 'Deleting…' : 'Delete'}</button>
            </footer>
          </div>
        </>
      )}
      {tagDoc && <TagEditor doc={tagDoc} onClose={() => setTagDoc(null)} onSaved={handleTagsSaved} />}
    </>
  )

  // ── Collection detail page ──
  if (liveSelectedCol) {
    return (
      <>
        <CollectionDetail
          col={liveSelectedCol}
          docs={collectionDocs}
          onBack={() => setSelectedCollection(null)}
          onUpload={onUpload}
          onAsk={onAsk}
          docView={docView}
          setDocView={setDocView}
          onPipeline={setPipelineDoc}
          onMenu={openDocMenu}
          selected={selected}
          onToggle={handleToggle}
          onBulkDeleteConfirm={() => setBulkDeleteConfirm(true)}
          bulkDeleting={bulkDeleting}
        />
        {pipelineDoc && (() => {
          const liveDoc = documents.find(d => d.doc_id === pipelineDoc)
          return liveDoc ? <PipelineDialog doc={liveDoc} onClose={() => setPipelineDoc(null)} /> : null
        })()}
        {docMenu}
        {sharedModals}
        {bulkDeleteConfirm && (
          <>
            <div className="modal-scrim" onClick={() => setBulkDeleteConfirm(false)} />
            <div className="modal modal-danger" role="dialog">
              <header className="modal-head"><h3>Delete {selected.size} document{selected.size !== 1 ? 's' : ''}?</h3></header>
              <div className="modal-body">
                <p>These <b>{selected.size}</b> document{selected.size !== 1 ? 's' : ''} will be permanently removed.</p>
                <p className="quiet">This cannot be undone.</p>
              </div>
              <footer className="modal-foot">
                <button className="btn btn-secondary" onClick={() => setBulkDeleteConfirm(false)}>Cancel</button>
                <button className="btn btn-danger" disabled={bulkDeleting} onClick={handleBulkDelete}>
                  {bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}
                </button>
              </footer>
            </div>
          </>
        )}
      </>
    )
  }

  // ── Main library view ──
  return (
    <>
    <div className="lib">
      <section className="lib-section">
        <div className="lib-section-head">
          <h2>Collections</h2>
        </div>
        <div className="lib-collections">
          {collections.map(c => (
            <article
              key={c.collection_id}
              className="col-card"
              onClick={() => setSelectedCollection(c)}
            >
              <div className="col-card-head">
                <h3>{c.name}</h3>
                <div className="col-card-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="col-card-btn"
                    title={`Upload to ${c.name}`}
                    onClick={() => onUpload(c.name)}
                  >
                    <Icon d="M12 16V4M6 10l6-6 6 6M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" size={14} />
                  </button>
                  <button
                    className="col-card-btn col-card-btn-ask"
                    title={`Ask ${c.name}`}
                    onClick={() => onAsk(c.name)}
                  >
                    <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" size={14} />
                  </button>
                </div>
              </div>
              <p className="col-card-desc">{c.description || 'No description.'}</p>
              <div className="col-card-foot">
                <span className="pill pill-neutral" style={{ fontSize: 11 }}>{c.doc_count} docs</span>
                <span className="quiet" style={{ fontSize: 11 }}>Updated {fmtDate(c.created_at)}</span>
              </div>
            </article>
          ))}
          {collections.length === 0 && (
            <div className="col-card" style={{ cursor: 'default', minHeight: 100, justifyContent: 'center' }}>
              <p className="quiet" style={{ textAlign: 'center', margin: 0 }}>No collections yet. Ask an admin to create one.</p>
            </div>
          )}
        </div>
      </section>

      <section className="lib-section">
        <div className="lib-section-head">
          <h2>Recent documents</h2>
          <span className="quiet">
            {documents.length} total{activeCount > 0 ? ` · ${activeCount} processing` : ''}
            {activeCount > 0 && <span style={{ marginLeft: 6, color: 'var(--ink-4)', fontSize: 11 }}>· updates every 10s</span>}
          </span>
        </div>

        <div className="doc-table">
          <div className="doc-row doc-head">
            <span>Document</span>
            <span>Collection</span>
            <span>Status</span>
            <span>Uploaded</span>
            <span></span>
          </div>
          {documents.length === 0 && (
            <div className="doc-row" style={{ gridTemplateColumns: '1fr' }}>
              <span className="quiet">No documents yet. Click the upload icon on a collection to get started.</span>
            </div>
          )}
          {[...documents]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5)
            .map(d => (
            <div key={d.doc_id} className={`doc-row ${d.status === 'FAILED' ? 'is-failed' : ''}`}>
              <span className="doc-file">
                <FileIcon ext={d.original_extension} size={24} />
                <span>
                  <b>{d.filename}</b>
                  <span className="quiet">{fmtSize(d.size_bytes)}</span>
                </span>
              </span>
              <span className="quiet">{d.collection_name || collections.find(c => c.collection_id === d.collection_id)?.name || '—'}</span>
              <span className="doc-status-col">
                <StatusPill status={d.status} onClick={() => setPipelineDoc(d.doc_id)} />
                {d.error_message && (
                  <span className="doc-error-msg" title={d.error_message}>{d.error_message}</span>
                )}
              </span>
              <span className="quiet">{fmtDate(d.created_at)}</span>
              <span className="doc-actions">
                {d.status === 'FAILED'
                  ? <button className="link" disabled={retrying === d.doc_id} onClick={() => handleRetry(d.doc_id)}>
                      {retrying === d.doc_id ? '…' : 'Retry'}
                    </button>
                  : d.status === 'COMPLETED'
                    ? <button className="link" onClick={() => onAsk(d.collection_name || collections.find(c => c.collection_id === d.collection_id)?.name, { docId: d.doc_id, docName: d.filename })}>Ask</button>
                    : null}
                <button
                  className="icon-btn conv-dots"
                  title="Options"
                  onClick={e => openDocMenu(d.doc_id, e)}
                >
                  <DotsIcon />
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>

    </div>

    {pipelineDoc && (() => {
      const liveDoc = documents.find(d => d.doc_id === pipelineDoc)
      return liveDoc ? <PipelineDialog doc={liveDoc} onClose={() => setPipelineDoc(null)} /> : null
    })()}

    {docMenu}
    {sharedModals}
    </>
  )
}

export { normalizeStatus, fmtSize, fmtDate }
