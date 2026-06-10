import React, { useState, useEffect, useCallback } from 'react'
import { saLogsIngestion, saLogsIngestionTrace } from '../adminApi.js'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtMs(ms) {
  if (ms === null || ms === undefined) return '—'
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's'
  return ms + 'ms'
}

function shortId(id) {
  return id ? id.slice(0, 8) + '…' : '—'
}

// ── Stage metadata label map ────────────────────────────────────────
const STAGE_LABEL = {
  started:       'Started',
  completed:     'Completed',
  failed:        'Failed',
  embedding:     'Embedding',
  bm25_indexing: 'BM25 Indexing',
  ontology:      'Ontology Extraction',
  graph_indexing:'Graph Indexing',
}

function dotClass(evt) {
  if (evt.status === 'error') return 'error'
  const stage = evt.stage || ''
  if (stage === 'completed') return 'success'
  if (evt.event_type === 'llm_call') return 'llm'
  if (evt.event_type === 'ingestion_stage') return 'store'
  return ''
}

// ── Meta pills from metadata JSONB ──────────────────────────────────
function MetaPills({ meta, eventType, stage, inputTokens, outputTokens }) {
  const pills = []

  if (inputTokens)  pills.push({ label: `in: ${inputTokens}`,  cls: 'token' })
  if (outputTokens) pills.push({ label: `out: ${outputTokens}`, cls: 'token' })

  if (meta && typeof meta === 'object') {
    const skip = new Set(['was_empty', 'model'])
    Object.entries(meta).forEach(([k, v]) => {
      if (skip.has(k)) return
      if (typeof v === 'object') return
      pills.push({ label: `${k}: ${v}`, cls: '' })
    })
    if (meta.model) pills.push({ label: meta.model, cls: '' })
  }

  if (!pills.length) return null
  return (
    <div className="sa-timeline-meta">
      {pills.map((p, i) => (
        <span key={i} className={`sa-meta-pill${p.cls ? ' ' + p.cls : ''}`}>{p.label}</span>
      ))}
    </div>
  )
}

// ── Trace drawer ────────────────────────────────────────────────────
function TraceDrawer({ docId, onClose }) {
  const [events,   setEvents]   = useState([])
  const [filename, setFilename] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [openTb,   setOpenTb]   = useState(null)

  useEffect(() => {
    saLogsIngestionTrace(docId)
      .then(d => { setEvents(d.events || []); setFilename(d.filename || null) })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [docId])

  const totalMs = (() => {
    if (!events.length) return null
    const first = new Date(events[0].created_at).getTime()
    const last  = new Date(events[events.length - 1].created_at).getTime()
    return last - first
  })()

  return (
    <div className="sa-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sa-drawer">
        <div className="sa-drawer-head">
          <div>
            <h2 className="sa-drawer-title">Ingestion Trace</h2>
            <p className="sa-drawer-sub">{filename || docId}</p>
            {totalMs !== null && (
              <p style={{ font: '400 11px var(--font-sans)', color: 'var(--ink-3)', marginTop: 4 }}>
                Total: {fmtMs(totalMs)}
              </p>
            )}
          </div>
          <button className="sa-drawer-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="sa-drawer-body">
          {loading && <div className="sa-loading">Loading trace…</div>}
          {!loading && events.length === 0 && <div className="sa-empty">No events found.</div>}
          {!loading && events.length > 0 && (
            <div className="sa-timeline">
              {events.map((evt, i) => {
                const label = STAGE_LABEL[evt.stage] || evt.stage || evt.event_type || '—'
                const isError = evt.status === 'error'
                const hasTb = isError && evt.error_traceback
                return (
                  <div key={i} className="sa-timeline-item">
                    <div className={`sa-timeline-dot ${dotClass(evt)}`} />
                    <div className="sa-timeline-body">
                      <div className="sa-timeline-row">
                        <span className="sa-timeline-stage" style={isError ? { color: 'var(--ember)' } : {}}>
                          {label}
                        </span>
                        {evt.duration_ms !== null && evt.duration_ms !== undefined && (
                          <span className="sa-timeline-dur">{fmtMs(evt.duration_ms)}</span>
                        )}
                        <span style={{ font: '400 11px var(--font-sans)', color: 'var(--ink-4)', marginLeft: 'auto' }}>
                          {fmtDate(evt.created_at)}
                        </span>
                      </div>

                      <MetaPills
                        meta={evt.metadata}
                        eventType={evt.event_type}
                        stage={evt.stage}
                        inputTokens={evt.input_tokens}
                        outputTokens={evt.output_tokens}
                      />

                      {isError && (
                        <div style={{ marginTop: 6 }}>
                          <span className="sa-meta-pill error">{evt.error_type}: {evt.error_message}</span>
                          {hasTb && (
                            <button
                              onClick={() => setOpenTb(openTb === i ? null : i)}
                              style={{ marginLeft: 8, font: '500 11px var(--font-sans)', color: 'var(--current)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              {openTb === i ? 'Hide traceback' : 'Show traceback'}
                            </button>
                          )}
                          {openTb === i && (
                            <pre className="sa-traceback">{evt.error_traceback}</pre>
                          )}
                        </div>
                      )}
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

// ── Main page ───────────────────────────────────────────────────────
export default function AdminIngestion() {
  const [items,     setItems]     = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [status,    setStatus]    = useState('')
  const [traceDoc,  setTraceDoc]  = useState(null)

  const LIMIT = 50

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: LIMIT }
      if (status) params.status = status
      const data = await saLogsIngestion(params)
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [page, status])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / LIMIT)

  // Group items: only show "started" events in the table (one row per doc)
  const rows = items.filter(it => it.stage === 'started' || !items.find(x => x.doc_id === it.doc_id && x.stage === 'started'))

  return (
    <>
      <div className="sa-topbar">
        <div className="sa-topbar-left">
          <h1 className="sa-page-title">Ingestion Logs</h1>
          <p className="sa-page-sub">{total} event(s) · click any row for full stage trace</p>
        </div>
        <div className="sa-topbar-right">
          <button className="sa-refresh-btn" onClick={load}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="sa-content">
        {/* Filters */}
        <div className="sa-filters">
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
        </div>

        {error && <div className="sa-err-banner">{error}</div>}

        <div className="sa-card">
          {loading && <div className="sa-loading">Loading…</div>}
          {!loading && (
            <>
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>Filename</th>
                      <th>Collection</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-4)' }}>No events</td></tr>
                    )}
                    {items.map((it, i) => {
                      const fname = it.filename || it.metadata?.filename || it.metadata?.file_name
                      return (
                      <tr key={i} onClick={() => it.doc_id && setTraceDoc(it.doc_id)} style={{ cursor: 'pointer' }}>
                        <td style={{ maxWidth: 260 }}>
                          <div className="sa-truncate" title={fname || '—'}>
                            {fname || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                          </div>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {it.collection_name || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                        </td>
                        <td>
                          <span className={`sa-badge ${it.status === 'success' ? 'success' : it.status === 'error' ? 'error' : 'neutral'}`}>
                            {it.stage || it.status}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtMs(it.duration_ms)}</td>
                        <td style={{ color: 'var(--ink-3)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(it.created_at)}</td>
                      </tr>
                    )})}

                  </tbody>
                </table>
              </div>
              <div className="sa-pagination">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
                <span>Page {page} of {totalPages || 1}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>Next</button>
                <span style={{ marginLeft: 'auto' }}>{total} total</span>
              </div>
            </>
          )}
        </div>
      </div>

      {traceDoc && <TraceDrawer docId={traceDoc} onClose={() => setTraceDoc(null)} />}
    </>
  )
}
