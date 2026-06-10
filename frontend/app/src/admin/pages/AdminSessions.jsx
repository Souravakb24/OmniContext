import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { saLogsSessions } from '../adminApi.js'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AdminSessions() {
  const navigate = useNavigate()
  const [items,   setItems]   = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const LIMIT = 50

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await saLogsSessions({ page, limit: LIMIT })
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <>
      <div className="sa-topbar">
        <div className="sa-topbar-left">
          <h1 className="sa-page-title">Conversation Sessions</h1>
          <p className="sa-page-sub">{total} sessions · click any row to see turns</p>
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
        {error && <div className="sa-err-banner">{error}</div>}

        <div className="sa-card">
          {loading && <div className="sa-loading">Loading…</div>}
          {!loading && (
            <>
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>Session title</th>
                      <th>Collection</th>
                      <th>Turns</th>
                      <th>Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-4)' }}>No sessions logged yet</td></tr>
                    )}
                    {items.map((it, i) => (
                      <tr key={i} style={{ cursor: 'pointer' }}
                          onClick={() => it.session_id && navigate(`/admin/sessions/${it.session_id}`)}>
                        <td style={{ maxWidth: 300 }}>
                          <div className="sa-truncate" title={it.title || it.session_id}>
                            {it.title
                              ? <span style={{ color: 'var(--ink)' }}>{it.title}</span>
                              : <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>Untitled session</span>}
                          </div>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {it.collection_name || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                          {it.turn_count ?? '—'}
                        </td>
                        <td style={{ color: 'var(--ink-3)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {fmtDate(it.last_active)}
                        </td>
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
