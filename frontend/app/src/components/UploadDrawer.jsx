import React, { useState, useEffect, useRef } from 'react'
import * as api from '../api.js'
import { FileIcon } from './Library.jsx'
import { useToast } from './Toast.jsx'

const PIPELINE = ['QUEUED', 'CONVERTING', 'PARSING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'COMPLETED']

function stepLabel(s) {
  if (s === 'COMPLETED') return 'Indexed'
  return s.charAt(0) + s.slice(1).toLowerCase()
}

function getStepIndex(status) {
  const i = PIPELINE.indexOf(status)
  return i === -1 ? 0 : i
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6L9 17l-5-5"/></svg>
)

const XIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 6l12 12M18 6 6 18"/></svg>
)

function UploadItem({ item, onAskMore, onRetry }) {
  const { file, status, error, docId, collection } = item
  const ext = file.name.split('.').pop().toLowerCase()
  const activeIdx = getStepIndex(status)
  const isDone = status === 'COMPLETED'
  const isFailed = status === 'FAILED'
  const isUploading = status === 'UPLOADING'

  return (
    <div className="ingest">
      <div className="ingest-file">
        <FileIcon ext={ext} />
        <div>
          <b>{file.name}</b>
          <span className="quiet">{(file.size / 1024).toFixed(0)} KB → {collection}</span>
        </div>
        {isUploading && <span className="spinner" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
      </div>

      {!isUploading && (() => {
        const total = PIPELINE.length
        const pct = isDone ? 100
          : isFailed ? Math.max(4, Math.round((activeIdx / (total - 1)) * 100))
          : Math.max(4, Math.round((Math.max(activeIdx, 0) / (total - 1)) * 100))
        const tone  = isFailed ? 'failed' : isDone ? 'done' : 'active'
        const label = isFailed ? 'Failed' : isDone ? 'Indexed' : 'Processing…'
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

      {isDone && (
        <div className="ingest-done">
          <p><b>Indexed.</b> {file.name} is now searchable in <code>{collection}</code>.</p>
          <div className="ingest-actions">
            <button className="btn btn-primary btn-sm" onClick={onAskMore}>Ask a question</button>
          </div>
        </div>
      )}

      {isFailed && (
        <div className="ingest-failed-box">
          <p><b>Failed.</b> {error || 'Ingestion failed — check the document and try again.'}</p>
          <div className="ingest-actions">
            {docId && <button className="btn btn-danger btn-sm" onClick={() => onRetry(docId)}>Retry ingestion</button>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function UploadDrawer({ open, onClose, onUploaded, onAsk, defaultCollection = null }) {
  const showToast = useToast()
  const [collections, setCollections] = useState([])
  const [collection, setCollection] = useState('')
  const [drag, setDrag] = useState(false)
  const [uploads, setUploads] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [storageMode, setStorageMode] = useState('Vector_DB')
  const [quota, setQuota] = useState(null)   // { used, remaining }
  const pollRefs = useRef({})

  useEffect(() => {
    if (!open) return
    api.getUploadCollections().then(data => {
      setCollections(data)
      if (defaultCollection && data.find(c => c.name === defaultCollection)) {
        setCollection(defaultCollection)
      } else if (data.length) {
        setCollection(data[0].name)
      }
    }).catch(() => {})
  }, [open, defaultCollection])

  const startPolling = (docId, uploadIdx) => {
    if (pollRefs.current[docId]) return
    pollRefs.current[docId] = setInterval(async () => {
      try {
        const s = await api.getDocStatus(docId)
        setUploads(prev => prev.map((u, i) =>
          i === uploadIdx ? { ...u, status: s.status, error: s.error_message || null } : u
        ))
        if (s.status === 'COMPLETED' || s.status === 'FAILED') {
          clearInterval(pollRefs.current[docId])
          delete pollRefs.current[docId]
        }
      } catch {}
    }, 10000)
  }

  const handleFiles = async (files) => {
    if (!collection) { setUploadError('Select a collection first.'); return }
    setUploadError('')
    setUploading(true)

    // Add all picked files immediately so the user sees them queued
    const startIdx = uploads.length
    const newItems = files.map(f => ({ file: f, status: 'UPLOADING', error: null, docId: null, collection }))
    setUploads(prev => [...prev, ...newItems])

    try {
      const res = await api.uploadFiles(files, collection, [], storageMode)
      setQuota({ used: res.uploads_used_today, remaining: res.uploads_remaining_today })

      // Index the batch result by filename for O(1) lookup
      const uploadedByName = {}
      res.uploaded.forEach(u => { uploadedByName[u.filename] = u })
      const failedByName = {}
      res.failed.forEach(f => { failedByName[f.filename] = f })

      setUploads(prev => prev.map((u, i) => {
        if (i < startIdx) return u
        const fname = newItems[i - startIdx].file.name
        if (uploadedByName[fname]) {
          const up = uploadedByName[fname]
          return { ...u, status: up.status, docId: up.doc_id }
        }
        if (failedByName[fname]) {
          const fail = failedByName[fname]
          return { ...u, status: 'FAILED', error: `${fail.error}: ${fail.reason}` }
        }
        return { ...u, status: 'FAILED', error: 'No response from server.' }
      }))

      // Poll each successfully queued doc
      res.uploaded.forEach(up => {
        const localIdx = newItems.findIndex(ni => ni.file.name === up.filename)
        if (localIdx !== -1) startPolling(up.doc_id, startIdx + localIdx)
      })

      if (onUploaded) onUploaded()
      const uploadedCount = res.uploaded?.length || 0
      const failedCount = res.failed?.length || 0
      if (uploadedCount) showToast(`${uploadedCount} file${uploadedCount !== 1 ? 's' : ''} queued for processing.`)
      if (failedCount)   showToast(`${failedCount} file${failedCount !== 1 ? 's' : ''} failed to upload.`, 'error')
    } catch (err) {
      setUploads(prev => prev.map((u, i) =>
        i >= startIdx ? { ...u, status: 'FAILED', error: err.message } : u
      ))
    } finally {
      setUploading(false)
    }
  }

  const handleRetry = async (docId) => {
    try {
      await api.retryDocument(docId)
      const idx = uploads.findIndex(u => u.docId === docId)
      if (idx !== -1) {
        setUploads(prev => prev.map((u, i) =>
          i === idx ? { ...u, status: 'QUEUED', error: null } : u
        ))
        startPolling(docId, idx)
      }
    } catch (err) {
      alert(err.message)
    }
  }

  const handleClose = () => {
    Object.values(pollRefs.current).forEach(clearInterval)
    pollRefs.current = {}
    if (uploads.some(u => u.docId)) onUploaded?.()
    onClose()
  }

  if (!open) return null

  return (
    <>
      <div className="drawer-scrim" onClick={handleClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <h3>Upload documents</h3>
          <button className="icon-btn" onClick={handleClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </header>

        <div className="drawer-body">
          <label className="field">
            <span className="field-label">Collection</span>
            <select value={collection} onChange={e => setCollection(e.target.value)} disabled={uploading || uploads.length > 0}>
              {collections.length === 0 && <option value="">No collections — ask an admin to create one</option>}
              {collections.map(c => <option key={c.collection_id} value={c.name}>{c.name}</option>)}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Storage mode</span>
            <select value={storageMode} onChange={e => setStorageMode(e.target.value)} disabled={uploading || uploads.length > 0}>
              <option value="Vector_DB">Vector DB only (default)</option>
              <option value="both_DB">Vector DB + Knowledge Graph</option>
            </select>
          </label>

          {uploadError && <p className="login-err">{uploadError}</p>}

          {quota && (
            <p className="quiet" style={{ fontSize: 12, margin: '0 0 8px' }}>
              Uploads today: <b>{quota.used}</b> · {quota.remaining} remaining
            </p>
          )}

          {uploads.length > 0 && (
            <div className="upload-queue">
              {uploads.map((item, i) => (
                <UploadItem
                  key={i}
                  item={item}
                  onAskMore={() => { handleClose(); onAsk?.() }}
                  onRetry={handleRetry}
                />
              ))}
            </div>
          )}

          {/* Add files — available even while others are processing. Each new file
              is appended and queued; the worker processes the queue in turn. */}
          <label
            className={`dropzone ${drag ? 'is-drag' : ''} ${uploads.length > 0 ? 'dropzone-compact' : ''} ${uploading ? 'is-disabled' : ''}`}
            onDragOver={e => { if (uploading) return; e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => {
              e.preventDefault(); setDrag(false)
              if (uploading) return
              const files = Array.from(e.dataTransfer.files)
              if (files.length) handleFiles(files)
            }}
          >
            <svg viewBox="0 0 24 24" width={uploads.length > 0 ? 20 : 32} height={uploads.length > 0 ? 20 : 32} fill="none" stroke="#2E6F8E" strokeWidth="1.5">
              <path d="M12 16V4M6 10l6-6 6 6"/>
              <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>
            </svg>
            {uploads.length > 0
              ? <p><b>Upload more</b> or <span className="link">browse</span></p>
              : <><p><b>Drop files</b> or <span className="link">browse</span></p>
                  <p className="quiet">PDF · DOCX · PPT · PPTX · up to 50 MB each</p></>
            }
            <input
              type="file"
              accept=".pdf,.docx,.ppt,.pptx"
              multiple
              disabled={uploading}
              onChange={e => {
                const files = Array.from(e.target.files)
                if (files.length) handleFiles(files)
                e.target.value = ''
              }}
              hidden
            />
          </label>

          {uploading && (
            <p className="quiet" style={{ textAlign: 'center', marginTop: 8 }}>Sending files…</p>
          )}
        </div>
      </aside>
    </>
  )
}
