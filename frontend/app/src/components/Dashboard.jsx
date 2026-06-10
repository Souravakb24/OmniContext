import React, { useState, useEffect } from 'react'
import * as api from '../api.js'

function fmtBytes(b) {
  if (!b) return '0 B'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// ─── Score arc (SVG half-circle gauge) ───────────────────────────────────────

function ScoreGauge({ value }) {
  if (value == null) return <div className="db2-gauge-empty">No data</div>
  const pct = Math.round(value * 100)
  // half-circle: r=44, arc from 180° to 0° = half circle at top
  const r = 44, cx = 56, cy = 56
  const circ = Math.PI * r  // half circumference
  const fill = (pct / 100) * circ
  const color = pct >= 85 ? '#5C7A4F' : pct >= 70 ? '#D9B271' : '#C24A3A'
  const startX = cx - r, startY = cy
  const endX   = cx + r, endY   = cy
  return (
    <div className="db2-gauge">
      <svg viewBox="0 0 112 68" width="160" height="96">
        {/* track */}
        <path d={`M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`}
          fill="none" stroke="var(--mist)" strokeWidth="8" strokeLinecap="round" />
        {/* fill */}
        <path d={`M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`}
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`} />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="700"
          style={{ fill: 'var(--ink)' }} fontFamily="Geist Mono, monospace">{pct}%</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" style={{ fill: 'var(--ink-3)' }}
          fontFamily="Geist, sans-serif" letterSpacing="0.08em">QUALITY SCORE</text>
      </svg>
    </div>
  )
}

// ─── Readiness arc (tiny SVG donut arc per collection) ───────────────────────

function ReadinessArc({ ready, total, size = 32 }) {
  if (total === 0) return <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>—</span>
  const pct = ready / total
  const r = 12, cx = 16, cy = 16
  const circ = 2 * Math.PI * r
  const fill = pct * circ
  const color = pct === 1 ? '#5C7A4F' : pct > 0.5 ? '#D9B271' : '#C24A3A'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--mist)" strokeWidth="3.5" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="8" fontWeight="600"
        fill={color} fontFamily="Geist Mono, monospace">{Math.round(pct * 100)}</text>
    </svg>
  )
}

// ─── Inline chunk bar ─────────────────────────────────────────────────────────

function ChunkBar({ value, max }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="db2-chunkbar">
      <div className="db2-chunkbar-fill" style={{ width: `${pct}%` }} />
      <span>{value.toLocaleString()}</span>
    </div>
  )
}

// ─── Donut chart (simple/complex or pass/fail) ────────────────────────────────

function Donut({ slices, size = 80, thickness = 14 }) {
  const r = (size - thickness) / 2
  const cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const total = slices.reduce((s, sl) => s + sl.value, 0)
  if (total === 0) return <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontSize: 11 }}>—</div>

  let offset = 0
  const arcs = slices.map(sl => {
    const len = (sl.value / total) * circ
    const arc = { ...sl, offset, len }
    offset += len
    return arc
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--mist)" strokeWidth={thickness} />
      {arcs.map((a, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={a.color}
          strokeWidth={thickness} strokeDasharray={`${a.len} ${circ - a.len}`}
          strokeDashoffset={-a.offset} strokeLinecap="butt" />
      ))}
    </svg>
  )
}

// ─── Horizontal domain chart ──────────────────────────────────────────────────

const DOMAIN_COLORS = ['#2E6F8E', '#5C7A4F', '#D9B271', '#C24A3A', '#7A5A9E', '#5A6878']

function DomainChart({ domains }) {
  if (!domains.length) return <p className="db2-empty">No domain data yet.</p>
  const max = domains[0].count
  return (
    <div className="db2-domain-chart">
      {domains.map((d, i) => {
        const pct = Math.round((d.count / max) * 100)
        return (
          <div key={d.domain} className="db2-domain-row">
            <span className="db2-domain-label">{d.domain.replace(/_/g, ' ')}</span>
            <div className="db2-domain-track">
              <div className="db2-domain-fill"
                style={{ width: `${pct}%`, background: DOMAIN_COLORS[i % DOMAIN_COLORS.length] }} />
            </div>
            <span className="db2-domain-num">{d.count}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    api.getDashboard()
      .then(setData)
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="db2-center">
      <div className="db2-spinner" />
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading dashboard…</span>
    </div>
  )

  if (error) return (
    <div className="db2-center">
      <span style={{ color: 'var(--ember)' }}>{error}</span>
    </div>
  )

  const { collections, domains, kg_coverage, chat_stats, total_storage_bytes } = data

  const totalDocs   = collections.reduce((s, c) => s + c.doc_count, 0)
  const totalChunks = collections.reduce((s, c) => s + c.chunk_count, 0)
  const totalPages  = collections.reduce((s, c) => s + c.total_pages, 0)
  const readyDocs   = collections.reduce((s, c) => s + c.ready_count, 0)
  const maxChunks   = Math.max(...collections.map(c => c.chunk_count), 1)

  const { total_conversations, total_turns, avg_score, pass_rate,
          graph_sessions, avg_iterations, simple_queries, complex_queries } = chat_stats

  const totalQ   = simple_queries + complex_queries
  const passCount = pass_rate != null ? Math.round(pass_rate * total_turns) : 0
  const failCount = total_turns - passCount

  return (
    <div className="db2">

      {/* ── hero stat strip ── */}
      <div className="db2-hero">
        <div className="db2-hero-tile">
          <span className="db2-tile-label">Documents</span>
          <span className="db2-tile-num">{totalDocs}</span>
          <span className="db2-tile-sub">{readyDocs} ready · {totalDocs - readyDocs} pending</span>
        </div>
        <div className="db2-hero-tile db2-tile-accent">
          <span className="db2-tile-label">Chunks indexed</span>
          <span className="db2-tile-num">{totalChunks.toLocaleString()}</span>
          <span className="db2-tile-sub">{totalPages} pages parsed</span>
        </div>
        <div className="db2-hero-tile">
          <span className="db2-tile-label">Conversations</span>
          <span className="db2-tile-num">{total_conversations}</span>
          <span className="db2-tile-sub">{total_turns} total turns</span>
        </div>
        <div className="db2-hero-tile">
          <span className="db2-tile-label">Graph sessions</span>
          <span className="db2-tile-num">{graph_sessions}</span>
          <span className="db2-tile-sub">of {total_conversations} used KG</span>
        </div>
        <div className="db2-hero-tile">
          <span className="db2-tile-label">Storage</span>
          <span className="db2-tile-num">{fmtBytes(total_storage_bytes)}</span>
          <span className="db2-tile-sub">{collections.length} collections</span>
        </div>
      </div>

      {/* ── main grid ── */}
      <div className="db2-grid">

        {/* collections panel */}
        <div className="db2-panel db2-panel-collections">
          <div className="db2-panel-head">
            <span className="db2-panel-title">Collections</span>
            <span className="db2-panel-meta">{collections.length} total</span>
          </div>
          <div className="db2-col-table">
            <div className="db2-col-thead">
              <span>Name</span>
              <span>Ready</span>
              <span>Chunks</span>
              <span>Pages</span>
              <span>Tables</span>
              <span>Figures</span>
              <span>Size</span>
            </div>
            {collections.map(c => (
              <div key={c.collection_id} className="db2-col-row">
                <span className="db2-col-name">{c.name}</span>
                <span><ReadinessArc ready={c.ready_count} total={c.doc_count} /></span>
                <span><ChunkBar value={c.chunk_count} max={maxChunks} /></span>
                <span className="db2-mono">{c.total_pages || '—'}</span>
                <span className="db2-mono">{c.tables || '—'}</span>
                <span className="db2-mono">{c.figures || '—'}</span>
                <span className="db2-dim">{fmtBytes(c.size_bytes)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RAG performance panel */}
        <div className="db2-panel db2-panel-rag">
          <div className="db2-panel-head">
            <span className="db2-panel-title">RAG Performance</span>
          </div>

          <ScoreGauge value={avg_score} />

          <div className="db2-rag-grid">
            <div className="db2-rag-kv">
              <span className="db2-rag-k">Pass rate</span>
              <span className="db2-rag-v" style={{ color: pass_rate >= 0.8 ? '#5C7A4F' : pass_rate >= 0.6 ? '#D9B271' : '#C24A3A' }}>
                {pass_rate != null ? `${Math.round(pass_rate * 100)}%` : '—'}
              </span>
            </div>
            <div className="db2-rag-kv">
              <span className="db2-rag-k">Avg iterations</span>
              <span className="db2-rag-v">{avg_iterations != null ? avg_iterations.toFixed(1) : '—'}</span>
            </div>
          </div>

          {/* pass/fail donut */}
          {total_turns > 0 && (
            <div className="db2-donut-row">
              <Donut size={72} thickness={12} slices={[
                { value: passCount, color: 'var(--moss)' },
                { value: failCount, color: 'var(--ember)' },
              ]} />
              <div className="db2-donut-legend">
                <div className="db2-legend-item"><span className="db2-legend-dot" style={{ background: 'var(--moss)' }} /><span>Pass</span><b>{passCount}</b></div>
                <div className="db2-legend-item"><span className="db2-legend-dot" style={{ background: 'var(--ember)' }} /><span>Fail</span><b>{failCount}</b></div>
              </div>
            </div>
          )}

          {/* complexity donut */}
          {totalQ > 0 && (
            <div className="db2-donut-row">
              <Donut size={72} thickness={12} slices={[
                { value: simple_queries, color: 'var(--current)' },
                { value: complex_queries, color: 'var(--sand)' },
              ]} />
              <div className="db2-donut-legend">
                <div className="db2-legend-item"><span className="db2-legend-dot" style={{ background: 'var(--current)' }} /><span>Simple</span><b>{simple_queries}</b></div>
                <div className="db2-legend-item"><span className="db2-legend-dot" style={{ background: 'var(--sand)' }} /><span>Complex</span><b>{complex_queries}</b></div>
              </div>
            </div>
          )}
        </div>

        {/* right col: domains + KG */}
        <div className="db2-right">

          <div className="db2-panel">
            <div className="db2-panel-head">
              <span className="db2-panel-title">Domain distribution</span>
            </div>
            <DomainChart domains={domains} />
          </div>

          <div className="db2-panel db2-panel-kg">
            <div className="db2-kg-top">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--current)" strokeWidth="1.8">
                <circle cx="5" cy="12" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="19" cy="19" r="3"/>
                <path d="M8 11l8-5M8 13l8 5"/>
              </svg>
              <span className="db2-panel-title">Knowledge graph</span>
            </div>
            <div className="db2-kg-nums">
              <span className="db2-kg-big">{kg_coverage.needs_graph}</span>
              <span className="db2-kg-sep">/</span>
              <span className="db2-kg-total">{kg_coverage.total_indexed}</span>
              <span className="db2-dim" style={{ marginLeft: 8, fontSize: 11 }}>docs graph-ready</span>
            </div>
            <div className="db2-kg-track">
              <div className="db2-kg-fill"
                style={{ width: kg_coverage.total_indexed > 0
                  ? `${Math.round((kg_coverage.needs_graph / kg_coverage.total_indexed) * 100)}%`
                  : '0%' }} />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
