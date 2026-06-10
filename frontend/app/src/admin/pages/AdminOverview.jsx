import React, { useState, useEffect, useCallback } from 'react'
import { saLogsSummary, saStats, saLogsStoreHealth } from '../adminApi.js'

function fmtNum(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function fmtMs(ms) {
  if (!ms) return '—'
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's'
  return ms + 'ms'
}

function KpiCard({ label, value, sub, variant }) {
  return (
    <div className={`sa-kpi-card${variant ? ' ' + variant : ''}`}>
      <div className="sa-kpi-label">{label}</div>
      <div className="sa-kpi-value">{value}</div>
      {sub && <div className="sa-kpi-sub">{sub}</div>}
    </div>
  )
}

function HealthBar({ store, data }) {
  const hitRate = data ? (100 - (data.empty_rate_pct || 0)) : 0
  const cls = hitRate >= 80 ? 'good' : hitRate >= 50 ? 'warn' : 'bad'
  return (
    <div className="sa-health-card">
      <div className="sa-health-name">{store} Store</div>
      <div className="sa-health-rate" style={{ color: cls === 'good' ? 'var(--moss)' : cls === 'warn' ? 'var(--sand)' : 'var(--ember)' }}>
        {data ? hitRate.toFixed(1) + '%' : '—'}
      </div>
      <div className="sa-health-track">
        <div className="sa-health-fill" style={{ width: `${hitRate}%` }} />
      </div>
      <div className="sa-health-meta">
        {data ? `${data.total_calls} queries · avg ${fmtMs(data.avg_latency_ms)}` : 'No data'}
      </div>
    </div>
  )
}

export default function AdminOverview() {
  const [summary,  setSummary]  = useState(null)
  const [stats,    setStats]    = useState(null)
  const [health,   setHealth]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [s, st, h] = await Promise.all([saLogsSummary(), saStats(), saLogsStoreHealth()])
      setSummary(s)
      setStats(st)
      setHealth(h)
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const storeMap = {}
  health.forEach(h => { storeMap[h.store] = h })

  return (
    <>
      <div className="sa-topbar">
        <div className="sa-topbar-left">
          <h1 className="sa-page-title">Overview</h1>
          <p className="sa-page-sub">Platform health at a glance — last 24 hours</p>
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

        {!loading && summary && (
          <>
            {/* KPI row */}
            <div className="sa-kpi-grid">
              <KpiCard
                label="Docs Ingested"
                value={fmtNum(summary.docs_ingested?.['24h'])}
                sub={`${fmtNum(summary.docs_ingested?.['7d'])} this week · ${summary.doc_errors?.['24h'] || 0} failed`}
                variant={summary.doc_errors?.['24h'] > 0 ? '' : 'success'}
              />
              <KpiCard
                label="Queries Handled"
                value={fmtNum(summary.queries_handled?.['24h'])}
                sub={`${fmtNum(summary.queries_handled?.['7d'])} this week · ${summary.query_errors?.['24h'] || 0} failed`}
                variant="accent"
              />
              <KpiCard
                label="Tokens Used"
                value={fmtNum(summary.total_tokens?.['24h'])}
                sub={`${fmtNum(summary.total_tokens?.['7d'])} this week`}
              />
              <KpiCard
                label="Total Errors"
                value={fmtNum(summary.total_errors_24h)}
                sub="last 24 hours"
                variant={summary.total_errors_24h > 0 ? 'danger' : 'success'}
              />
            </div>

            {/* Performance */}
            <div className="sa-two-col">
              <div className="sa-card">
                <div className="sa-card-header">
                  <span className="sa-card-title">Avg Ingestion Time (7d)</span>
                </div>
                <div className="sa-card-body">
                  <div style={{ font: '600 36px var(--font-sans)', color: 'var(--current)', letterSpacing: '-0.02em' }}>
                    {fmtMs(summary.avg_ingest_ms)}
                  </div>
                  <div style={{ font: '400 12px var(--font-sans)', color: 'var(--ink-3)', marginTop: 6 }}>
                    per document end-to-end
                  </div>
                </div>
              </div>
              <div className="sa-card">
                <div className="sa-card-header">
                  <span className="sa-card-title">Avg Query Time (7d)</span>
                </div>
                <div className="sa-card-body">
                  <div style={{ font: '600 36px var(--font-sans)', color: 'var(--current)', letterSpacing: '-0.02em' }}>
                    {fmtMs(summary.avg_query_ms)}
                  </div>
                  <div style={{ font: '400 12px var(--font-sans)', color: 'var(--ink-3)', marginTop: 6 }}>
                    from query received to answer streamed
                  </div>
                </div>
              </div>
            </div>

            {/* Store health */}
            <div className="sa-card">
              <div className="sa-card-header">
                <span className="sa-card-title">Retrieval Store Health</span>
                <span style={{ font: '400 12px var(--font-sans)', color: 'var(--ink-3)' }}>Hit rate (% non-empty results)</span>
              </div>
              <div className="sa-card-body">
                <div className="sa-health-grid">
                  <HealthBar store="Vector"  data={storeMap['vector']} />
                  <HealthBar store="BM25"    data={storeMap['bm25']}   />
                  <HealthBar store="Graph"   data={storeMap['graph']}  />
                </div>
              </div>
            </div>

            {/* Platform stats */}
            {stats && (
              <div className="sa-card">
                <div className="sa-card-header">
                  <span className="sa-card-title">Platform Totals</span>
                </div>
                <div className="sa-card-body">
                  <div className="sa-stat-grid">
                    <div className="sa-stat-card accent">
                      <div className="sa-stat-val">{stats.total_orgs ?? '—'}</div>
                      <div className="sa-stat-label">Organisations</div>
                    </div>
                    <div className="sa-stat-card">
                      <div className="sa-stat-val">{stats.total_users ?? '—'}</div>
                      <div className="sa-stat-label">Users</div>
                    </div>
                    <div className="sa-stat-card">
                      <div className="sa-stat-val">{stats.total_collections ?? '—'}</div>
                      <div className="sa-stat-label">Collections</div>
                    </div>
                    <div className="sa-stat-card">
                      <div className="sa-stat-val">{stats.total_documents ?? '—'}</div>
                      <div className="sa-stat-label">Documents</div>
                    </div>
                    <div className="sa-stat-card success">
                      <div className="sa-stat-val">{stats.active_users ?? '—'}</div>
                      <div className="sa-stat-label">Active Users</div>
                    </div>
                    <div className="sa-stat-card danger">
                      <div className="sa-stat-val">{stats.failed_documents ?? '—'}</div>
                      <div className="sa-stat-label">Failed Docs</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
