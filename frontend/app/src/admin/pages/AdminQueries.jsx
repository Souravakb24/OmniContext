import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { saLogsQueries } from '../adminApi.js'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtMs(ms) {
  if (ms === null || ms === undefined) return '—'
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's'
  return ms + 'ms'
}

export default function AdminQueries() {
  const navigate = useNavigate()
  const [items,   setItems]   = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [status,  setStatus]  = useState('')

  const LIMIT = 50

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: LIMIT }
      if (status) params.status = status
      const data = await saLogsQueries(params)
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

  return (
    <>
      <div className="sa-topbar">
        <div className="sa-topbar-left">
          <h1 className="sa-page-title">Query Traces</h1>
          <p className="sa-page-sub">{total} queries · click any row for full pipeline trace</p>
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
                      <th>Query</th>
                      <th>Session</th>
                      <th>Turn</th>
                      <th>Collection</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-4)' }}>No queries logged yet</td></tr>
                    )}
                    {items.map((it, i) => (
                      <tr key={i} style={{ cursor: 'pointer' }}
                          onClick={() => it.query_id && navigate(`queries/${it.query_id}`)}>
                        <td style={{ maxWidth: 280 }}>
                          <div className="sa-truncate" title={it.raw_query || ''}>
                            {it.raw_query
                              ? <span style={{ color: 'var(--ink)' }}>{it.raw_query}</span>
                              : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                          </div>
                        </td>
                        <td style={{ maxWidth: 160 }}>
                          {it.session_title
                            ? <div className="sa-truncate" title={it.session_title} style={{ fontSize: 12 }}>{it.session_title}</div>
                            : <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {it.turn_index !== null && it.turn_index !== undefined
                            ? `${it.turn_index + 1} / ${it.total_turns || '?'}`
                            : '—'}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {it.collection_name || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                        </td>
                        <td>
                          <span className={`sa-badge ${it.status === 'success' ? 'success' : 'error'}`}>
                            {it.status}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtMs(it.duration_ms)}</td>
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
                <span style={{ marginLeft: 'auto' }}>{total} total</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
