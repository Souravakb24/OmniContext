import React, { useState, useEffect, useCallback } from 'react'
import { saLogsStoreHealth } from '../adminApi.js'

function fmtMs(ms) {
  if (!ms) return '—'
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's'
  return Math.round(ms) + 'ms'
}

const STORE_INFO = {
  vector: {
    label:       'Vector Store (ChromaDB)',
    description: 'Semantic similarity search via embeddings',
    icon:        'd="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"',
  },
  bm25: {
    label:       'BM25 Store (PostgreSQL FTS)',
    description: 'Keyword-based full-text search',
    icon:        'd="M4 6h16M4 12h16M4 18h16"',
  },
  graph: {
    label:       'Graph Store (Memgraph)',
    description: 'Knowledge graph entity traversal',
    icon:        'd="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"',
  },
}

function HealthCard({ name, data }) {
  const info = STORE_INFO[name] || { label: name, description: '' }
  const hitRate = data ? (100 - (data.empty_rate_pct || 0)) : null
  const cls = hitRate === null ? '' : hitRate >= 80 ? 'good' : hitRate >= 50 ? 'warn' : 'bad'
  const color = cls === 'good' ? 'var(--moss)' : cls === 'warn' ? 'var(--sand)' : cls === 'bad' ? 'var(--ember)' : 'var(--ink-4)'

  return (
    <div className="sa-card" style={{ margin: 0 }}>
      <div className="sa-card-header" style={{ gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--mist)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth="1.8" strokeLinecap="round">
              <path d={info.icon?.replace('d="', '').replace('"', '') || 'M12 2L2 7l10 5 10-5-10-5z'} />
            </svg>
          </div>
          <div>
            <div className="sa-card-title">{info.label}</div>
            <div style={{ font: '400 11px var(--font-sans)', color: 'var(--ink-3)', marginTop: 2 }}>{info.description}</div>
          </div>
        </div>
      </div>
      <div className="sa-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!data ? (
          <div className="sa-empty" style={{ padding: '24px 0' }}>No data yet. Run queries to see health metrics.</div>
        ) : (
          <>
            {/* Hit rate */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ font: '500 12px var(--font-sans)', color: 'var(--ink-3)' }}>Hit rate</span>
                <span style={{ font: '700 20px var(--font-sans)', color, letterSpacing: '-0.02em' }}>
                  {hitRate !== null ? hitRate.toFixed(1) + '%' : '—'}
                </span>
              </div>
              <div className="sa-health-track" style={{ height: 10 }}>
                <div className={`sa-health-fill ${cls}`} style={{ width: `${hitRate || 0}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, font: '400 11px var(--font-sans)', color: 'var(--ink-4)' }}>
                <span>{data.empty_calls || 0} empty results</span>
                <span>{data.total_calls || 0} total calls</span>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: 'Total Calls',     value: data.total_calls   || 0 },
                { label: 'Empty Results',   value: data.empty_calls   || 0 },
                { label: 'Avg Latency',     value: fmtMs(data.avg_latency_ms) },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--paper-soft)', border: '1px solid var(--mist)', borderRadius: 7, padding: '10px 12px' }}>
                  <div style={{ font: '600 16px var(--font-sans)', color: 'var(--ink)', letterSpacing: '-0.01em' }}>{value}</div>
                  <div style={{ font: '400 10px var(--font-sans)', color: 'var(--ink-4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Status badge */}
            <div>
              <span className={`sa-badge ${cls === 'good' ? 'success' : cls === 'bad' ? 'error' : 'pending'}`}>
                <span className="pill-dot" />
                {cls === 'good' ? 'Healthy' : cls === 'warn' ? 'Degraded' : 'Unhealthy'}
              </span>
              {cls === 'bad' && (
                <span style={{ marginLeft: 10, font: '400 12px var(--font-sans)', color: 'var(--ember)' }}>
                  High empty-result rate — check indexing pipeline
                </span>
              )}
              {cls === 'warn' && (
                <span style={{ marginLeft: 10, font: '400 12px var(--font-sans)', color: 'var(--sand)' }}>
                  Over 20% of queries return no results
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function AdminStoreHealth() {
  const [stores,  setStores]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setStores(await saLogsStoreHealth())
    } catch (e) {
      setError(e.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const storeMap = {}
  stores.forEach(s => { storeMap[s.store] = s })

  const overallHit = stores.length > 0
    ? stores.reduce((acc, s) => acc + (100 - (s.empty_rate_pct || 0)), 0) / stores.length
    : null

  return (
    <>
      <div className="sa-topbar">
        <div className="sa-topbar-left">
          <h1 className="sa-page-title">Store Health</h1>
          <p className="sa-page-sub">Hit rates and latency for each retrieval store</p>
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
        {loading && <div className="sa-loading">Loading…</div>}

        {!loading && (
          <>
            {/* Overall banner */}
            {overallHit !== null && (
              <div className="sa-card">
                <div className="sa-card-body" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div>
                    <div style={{ font: '400 12px var(--font-sans)', color: 'var(--ink-3)' }}>Overall avg hit rate</div>
                    <div style={{
                      font: '700 32px var(--font-sans)',
                      color: overallHit >= 80 ? 'var(--moss)' : overallHit >= 50 ? 'var(--sand)' : 'var(--ember)',
                      letterSpacing: '-0.02em',
                    }}>
                      {overallHit.toFixed(1)}%
                    </div>
                  </div>
                  <div className="sa-health-track" style={{ flex: 1, height: 12 }}>
                    <div
                      className={`sa-health-fill ${overallHit >= 80 ? 'good' : overallHit >= 50 ? 'warn' : 'bad'}`}
                      style={{ width: `${overallHit}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Per-store cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <HealthCard name="vector" data={storeMap['vector']} />
              <HealthCard name="bm25"   data={storeMap['bm25']}   />
              <HealthCard name="graph"  data={storeMap['graph']}  />
            </div>

            {stores.length === 0 && (
              <div className="sa-empty">No store health data yet. Run some queries to populate metrics.</div>
            )}
          </>
        )}
      </div>
    </>
  )
}
