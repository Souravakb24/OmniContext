import React, { useState, useEffect, useCallback } from 'react'
import { saLogsTokens } from '../adminApi.js'

function fmtNum(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return String(Math.round(n))
}

function fmtMs(ms) {
  if (!ms) return '—'
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's'
  return Math.round(ms) + 'ms'
}

const STAGE_LABELS = {
  rewrite:                 'Query Rewrite',
  query_plan:              'Query Planning',
  answer:                  'Answer Generation',
  verification:            'Verification',
  refinement:              'Refinement',
  citation:                'Citation',
  ontology:                'Ontology Extraction',
  graph_extraction:        'Graph Extraction',
  graph_entity_extraction: 'Graph Entity Extract',
}

function BarChart({ rows, valueKey, labelKey, maxValue, color }) {
  return (
    <div className="sa-bar-chart">
      {rows.map((row, i) => {
        const val = row[valueKey] || 0
        const pct = maxValue > 0 ? Math.max(2, (val / maxValue) * 100) : 0
        const label = STAGE_LABELS[row[labelKey]] || row[labelKey] || '—'
        return (
          <div key={i} className="sa-bar-row">
            <div className="sa-bar-label" title={label}>{label}</div>
            <div className="sa-bar-track">
              <div className="sa-bar-fill" style={{ width: `${pct}%`, background: color || 'var(--current)' }} />
            </div>
            <div className="sa-bar-value">{fmtNum(val)}</div>
          </div>
        )
      })}
    </div>
  )
}

export default function AdminTokens() {
  const [data,    setData]    = useState([])
  const [groupBy, setGroupBy] = useState('stage')
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await saLogsTokens(groupBy))
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [groupBy])

  useEffect(() => { load() }, [load])

  const totalIn  = data.reduce((s, r) => s + (r.input_tokens_total  || 0), 0)
  const totalOut = data.reduce((s, r) => s + (r.output_tokens_total || 0), 0)
  const totalCalls = data.reduce((s, r) => s + (r.call_count || 0), 0)
  const maxIn  = Math.max(...data.map(r => r.input_tokens_total  || 0), 1)
  const maxOut = Math.max(...data.map(r => r.output_tokens_total || 0), 1)

  const groupLabel = { stage: 'Stage', model: 'Model', day: 'Day' }[groupBy]

  return (
    <>
      <div className="sa-topbar">
        <div className="sa-topbar-left">
          <h1 className="sa-page-title">Token Usage</h1>
          <p className="sa-page-sub">LLM token consumption across all pipeline stages</p>
        </div>
        <div className="sa-topbar-right">
          <div className="sa-tabs" style={{ width: 'auto' }}>
            {['stage', 'model', 'day'].map(g => (
              <button key={g} className={`sa-tab${groupBy === g ? ' active' : ''}`} onClick={() => setGroupBy(g)}>
                By {g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
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

        {/* Summary KPIs */}
        <div className="sa-kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="sa-kpi-card accent">
            <div className="sa-kpi-label">Total Input Tokens</div>
            <div className="sa-kpi-value">{fmtNum(totalIn)}</div>
            <div className="sa-kpi-sub">all time</div>
          </div>
          <div className="sa-kpi-card">
            <div className="sa-kpi-label">Total Output Tokens</div>
            <div className="sa-kpi-value">{fmtNum(totalOut)}</div>
            <div className="sa-kpi-sub">all time</div>
          </div>
          <div className="sa-kpi-card">
            <div className="sa-kpi-label">Total LLM Calls</div>
            <div className="sa-kpi-value">{fmtNum(totalCalls)}</div>
            <div className="sa-kpi-sub">all time</div>
          </div>
        </div>

        {loading && <div className="sa-loading">Loading…</div>}

        {!loading && data.length === 0 && (
          <div className="sa-empty">No LLM token data yet. Run some queries or ingest documents first.</div>
        )}

        {!loading && data.length > 0 && (
          <>
            {/* Input tokens chart */}
            <div className="sa-card">
              <div className="sa-card-header">
                <span className="sa-card-title">Input Tokens by {groupLabel}</span>
                <span style={{ font: '400 12px var(--font-sans)', color: 'var(--ink-3)' }}>tokens sent to LLM</span>
              </div>
              <div className="sa-card-body">
                <BarChart
                  rows={[...data].sort((a, b) => (b.input_tokens_total || 0) - (a.input_tokens_total || 0))}
                  valueKey="input_tokens_total"
                  labelKey="group_key"
                  maxValue={maxIn}
                  color="var(--current)"
                />
              </div>
            </div>

            {/* Output tokens chart */}
            <div className="sa-card">
              <div className="sa-card-header">
                <span className="sa-card-title">Output Tokens by {groupLabel}</span>
                <span style={{ font: '400 12px var(--font-sans)', color: 'var(--ink-3)' }}>tokens generated by LLM</span>
              </div>
              <div className="sa-card-body">
                <BarChart
                  rows={[...data].sort((a, b) => (b.output_tokens_total || 0) - (a.output_tokens_total || 0))}
                  valueKey="output_tokens_total"
                  labelKey="group_key"
                  maxValue={maxOut}
                  color="var(--sand)"
                />
              </div>
            </div>

            {/* Full table */}
            <div className="sa-card">
              <div className="sa-card-header">
                <span className="sa-card-title">Full Breakdown</span>
              </div>
              <div className="sa-table-wrap">
                <table className="sa-table">
                  <thead>
                    <tr>
                      <th>{groupLabel}</th>
                      <th>LLM Calls</th>
                      <th>Input Tokens</th>
                      <th>Output Tokens</th>
                      <th>Total Tokens</th>
                      <th>Avg Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, i) => {
                      const total = (row.input_tokens_total || 0) + (row.output_tokens_total || 0)
                      const label = STAGE_LABELS[row.group_key] || row.group_key || '—'
                      return (
                        <tr key={i} style={{ cursor: 'default' }}>
                          <td style={{ fontWeight: 500 }}>{label}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.call_count || 0}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--current-deep)' }}>
                            {fmtNum(row.input_tokens_total)}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#7A5A1C' }}>
                            {fmtNum(row.output_tokens_total)}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>
                            {fmtNum(total)}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}>
                            {fmtMs(row.avg_latency_ms)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
