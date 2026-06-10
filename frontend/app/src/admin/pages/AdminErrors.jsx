import React, { useState, useEffect, useCallback } from 'react'
import { saLogsErrors, saLogsErrorsGrouped } from '../adminApi.js'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function shortId(id) {
  return id ? id.slice(0, 8) + '…' : '—'
}

// ── Error detail drawer ─────────────────────────────────────────────
function ErrorDrawer({ err, onClose }) {
  return (
    <div className="sa-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sa-drawer">
        <div className="sa-drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="sa-drawer-title" style={{ color: 'var(--ember)' }}>{err.error_type || 'Error'}</h2>
            <p className="sa-drawer-sub">{err.event_type} · {err.stage}</p>
          </div>
          <button className="sa-drawer-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="sa-drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* IDs */}
          <div className="sa-card" style={{ margin: 0 }}>
            <div className="sa-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['Event ID',     err.id],
                ['Doc ID',       err.doc_id],
                ['Query ID',     err.query_id],
                ['Collection',   err.collection_id],
                ['When',         fmtDate(err.created_at)],
              ].map(([label, val]) => (
                val ? (
                  <div key={label} style={{ display: 'flex', gap: 12 }}>
                    <span style={{ font: '500 12px var(--font-sans)', color: 'var(--ink-3)', minWidth: 90 }}>{label}</span>
                    <span style={{ font: '400 12px var(--font-mono)', color: 'var(--ink-2)', wordBreak: 'break-all' }}>{val}</span>
                  </div>
                ) : null
              ))}
            </div>
          </div>

          {/* Error message */}
          <div>
            <div style={{ font: '500 12px var(--font-sans)', color: 'var(--ink-3)', marginBottom: 6 }}>Error message</div>
            <div style={{ padding: '10px 12px', background: 'var(--ember-soft)', border: '1px solid rgba(194,74,58,0.2)', borderRadius: 7, font: '400 13px var(--font-sans)', color: 'var(--ember)' }}>
              {err.error_message || '—'}
            </div>
          </div>

          {/* Traceback */}
          {err.error_traceback && (
            <div>
              <div style={{ font: '500 12px var(--font-sans)', color: 'var(--ink-3)', marginBottom: 6 }}>Traceback</div>
              <pre className="sa-traceback" style={{ maxHeight: 400 }}>{err.error_traceback}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Grouped view ────────────────────────────────────────────────────
function GroupedView() {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await saLogsErrorsGrouped())
      setError('')
    } catch (e) {
      setError(e.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const maxCount = Math.max(...rows.map(r => r.count || 0), 1)

  return (
    <div className="sa-card">
      <div className="sa-card-header">
        <span className="sa-card-title">Errors by Type</span>
        <button className="sa-refresh-btn" onClick={load} style={{ padding: '5px 10px' }}>Refresh</button>
      </div>
      {loading && <div className="sa-loading">Loading…</div>}
      {error && <div className="sa-err-banner" style={{ margin: '12px 16px' }}>{error}</div>}
      {!loading && rows.length === 0 && <div className="sa-empty">No errors recorded.</div>}
      {!loading && rows.length > 0 && (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Error Type</th>
                <th>Where</th>
                <th>Count</th>
                <th>Frequency</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const pct = Math.max(2, (row.count / maxCount) * 100)
                return (
                  <tr key={i} style={{ cursor: 'default' }}>
                    <td style={{ fontWeight: 600, color: 'var(--ember)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {row.error_type || 'Unknown'}
                    </td>
                    <td>
                      <span className="sa-badge neutral">{row.event_type}</span>
                    </td>
                    <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{row.count}</td>
                    <td style={{ width: 160 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="sa-bar-track" style={{ flex: 1 }}>
                          <div className="sa-bar-fill ember" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--ink-3)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(row.last_seen)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── All errors view ─────────────────────────────────────────────────
function AllErrorsView() {
  const [items,    setItems]    = useState([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [selected, setSelected] = useState(null)

  const LIMIT = 50

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await saLogsErrors({ page, limit: LIMIT })
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (e) {
      setError(e.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <>
      <div className="sa-card">
        <div className="sa-card-header">
          <span className="sa-card-title">All Errors</span>
          <button className="sa-refresh-btn" onClick={load} style={{ padding: '5px 10px' }}>Refresh</button>
        </div>
        {loading && <div className="sa-loading">Loading…</div>}
        {error && <div className="sa-err-banner" style={{ margin: '12px 16px' }}>{error}</div>}
        {!loading && (
          <>
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Error Type</th>
                    <th>Where</th>
                    <th>Doc / Query</th>
                    <th>Message</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-4)' }}>No errors</td></tr>
                  )}
                  {items.map((it, i) => (
                    <tr key={i} onClick={() => setSelected(it)}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ember)', fontWeight: 600 }}>
                        {it.error_type || 'Unknown'}
                      </td>
                      <td>
                        <span className="sa-badge neutral">{it.event_type}</span>
                        {it.stage && <span style={{ marginLeft: 5, font: '400 11px var(--font-sans)', color: 'var(--ink-3)' }}>{it.stage}</span>}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {shortId(it.doc_id || it.query_id)}
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        <div className="sa-truncate" title={it.error_message}
                          style={{ font: '400 12px var(--font-sans)', color: 'var(--ink-2)' }}>
                          {it.error_message || '—'}
                        </div>
                      </td>
                      <td style={{ color: 'var(--ink-3)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(it.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sa-pagination">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
              <span>Page {page} of {totalPages || 1}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>Next</button>
              <span style={{ marginLeft: 'auto' }}>{total} total errors</span>
            </div>
          </>
        )}
      </div>

      {selected && <ErrorDrawer err={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

// ── Main page ───────────────────────────────────────────────────────
export default function AdminErrors() {
  const [tab, setTab] = useState('grouped')

  return (
    <>
      <div className="sa-topbar">
        <div className="sa-topbar-left">
          <h1 className="sa-page-title">Error Center</h1>
          <p className="sa-page-sub">All pipeline errors across ingestion and retrieval</p>
        </div>
        <div className="sa-topbar-right">
          <div className="sa-tabs">
            <button className={`sa-tab${tab === 'grouped' ? ' active' : ''}`} onClick={() => setTab('grouped')}>By Type</button>
            <button className={`sa-tab${tab === 'all'     ? ' active' : ''}`} onClick={() => setTab('all')}>All Errors</button>
          </div>
        </div>
      </div>

      <div className="sa-content">
        {tab === 'grouped' && <GroupedView />}
        {tab === 'all'     && <AllErrorsView />}
      </div>
    </>
  )
}
