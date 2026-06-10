import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { saLogsSessionDetail } from '../adminApi.js'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtMs(ms) {
  if (ms === null || ms === undefined) return '—'
  return ms >= 1000 ? (ms / 1000).toFixed(2) + 's' : ms + 'ms'
}

export default function SessionDetail() {
  const { sessionId } = useParams()
  const navigate      = useNavigate()

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    setLoading(true)
    saLogsSessionDetail(sessionId)
      .then(d => setSession(d))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading) return <div className="sa-content"><div className="sa-loading">Loading session…</div></div>
  if (error)   return <div className="sa-content"><div className="sa-err-banner">{error}</div></div>
  if (!session) return null

  const turns = session.turns || []

  return (
    <>
      <div className="sa-topbar">
        <div className="sa-topbar-left" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="sa-back-btn" onClick={() => navigate(-1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back
          </button>
          <div>
            <h1 className="sa-page-title" style={{ marginBottom: 2 }}>
              {session.title || <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>Untitled session</span>}
            </h1>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {session.collection_name && (
                <span className="sa-meta-pill">{session.collection_name}</span>
              )}
              <span className="sa-meta-pill">{turns.length} turn{turns.length !== 1 ? 's' : ''}</span>
              {session.last_active && (
                <span style={{ font: '400 11px var(--font-sans)', color: 'var(--ink-4)' }}>
                  last active {fmtDate(session.last_active)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="sa-content">
        {turns.length === 0 && (
          <div className="sa-card">
            <div className="sa-empty">No turns found for this session.</div>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i}
               className="sa-turn-card"
               onClick={() => turn.query_id && navigate(`/admin/queries/${turn.query_id}`)}
               style={{ cursor: turn.query_id ? 'pointer' : 'default' }}>
            <div className="sa-turn-num">
              <span className="sa-turn-badge">Turn {turn.turn_index + 1}</span>
            </div>
            <div className="sa-turn-body">
              <div className="sa-turn-query">
                {turn.raw_query
                  ? <span>"{turn.raw_query}"</span>
                  : <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>No query text</span>}
              </div>
              {turn.final_answer && (
                <div className="sa-turn-answer">
                  {turn.final_answer}
                </div>
              )}
              <div className="sa-turn-meta">
                {turn.verification_score !== null && turn.verification_score !== undefined && (
                  <span className="sa-meta-pill">score: {turn.verification_score}</span>
                )}
                <span style={{ font: '400 11px var(--font-sans)', color: 'var(--ink-4)', marginLeft: 'auto' }}>
                  {fmtDate(turn.created_at)}
                </span>
                {turn.query_id && (
                  <span style={{ font: '400 11px var(--font-sans)', color: 'var(--current)', marginLeft: 8 }}>
                    View trace →
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
