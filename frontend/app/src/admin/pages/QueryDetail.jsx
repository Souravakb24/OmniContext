import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { saLogsQueryTrace } from '../adminApi.js'

// ── Smart content renderer: JSON viewer or Markdown ─────────────────
function SmartContent({ text, isOutput }) {
  const [jsonExpanded, setJsonExpanded] = useState({})

  if (!text) return null

  // Try to detect JSON
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      return <JsonViewer data={parsed} />
    } catch {}
  }

  // Markdown renderer
  return (
    <div className={`sa-md-body${isOutput ? ' output' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}

function JsonViewer({ data, depth = 0 }) {
  const [collapsed, setCollapsed] = useState({})
  const toggle = (k) => setCollapsed(p => ({ ...p, [k]: !p[k] }))

  if (Array.isArray(data)) {
    return (
      <div className="sa-json-array">
        {data.map((item, i) => (
          <div key={i} className="sa-json-item">
            <span className="sa-json-index">[{i}]</span>
            {typeof item === 'object' && item !== null
              ? <JsonViewer data={item} depth={depth + 1} />
              : <JsonScalar value={item} />}
          </div>
        ))}
      </div>
    )
  }

  if (typeof data === 'object' && data !== null) {
    return (
      <div className="sa-json-obj" style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
        {Object.entries(data).map(([k, v]) => {
          const isComplex = typeof v === 'object' && v !== null
          const isCollapsed = collapsed[k]
          return (
            <div key={k} className="sa-json-row">
              <span
                className={`sa-json-key${isComplex ? ' collapsible' : ''}`}
                onClick={isComplex ? () => toggle(k) : undefined}
              >
                {isComplex && <span className="sa-json-caret">{isCollapsed ? '▶' : '▼'}</span>}
                {k}:
              </span>
              {isComplex
                ? (!isCollapsed && <JsonViewer data={v} depth={depth + 1} />)
                : <JsonScalar value={v} />}
            </div>
          )
        })}
      </div>
    )
  }

  return <JsonScalar value={data} />
}

function JsonScalar({ value }) {
  const type = typeof value
  return (
    <span className={`sa-json-val ${type}`}>
      {type === 'string' ? `"${value}"` : String(value)}
    </span>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtMs(ms) {
  if (ms === null || ms === undefined) return '—'
  return ms >= 1000 ? (ms / 1000).toFixed(2) + 's' : ms + 'ms'
}

// ── Stage config ────────────────────────────────────────────────────
const STAGE_CONFIG = {
  received:                { label: 'Query Received',             dot: 'neutral', icon: '⬤' },
  rewrite:                 { label: 'Query Rewrite',              dot: 'llm',     icon: '✦' },
  query_plan:              { label: 'Query Planning',             dot: 'llm',     icon: '✦' },
  vector:                  { label: 'Vector Store',               dot: 'store',   icon: '◈' },
  bm25:                    { label: 'BM25 Store',                 dot: 'store',   icon: '◈' },
  graph:                   { label: 'Graph Store',                dot: 'store',   icon: '◈' },
  reranker_result:         { label: 'Reranker',                   dot: 'store',   icon: '◈' },
  answer:                  { label: 'Answer Generation',          dot: 'llm',     icon: '✦' },
  verification:            { label: 'Verification',               dot: 'llm',     icon: '✦' },
  refinement:              { label: 'Refinement',                 dot: 'llm',     icon: '✦' },
  citation:                { label: 'Citation Extraction',        dot: 'llm',     icon: '✦' },
  graph_entity_extraction: { label: 'Graph Entity Extraction',    dot: 'llm',     icon: '✦' },
  completed:               { label: 'Query Completed',            dot: 'success', icon: '●' },
  failed:                  { label: 'Query Failed',               dot: 'error',   icon: '✖' },
}

function stageKey(evt) {
  if (evt.event_type === 'store_result' || evt.event_type === 'reranker_result') {
    return evt.event_type === 'reranker_result' ? 'reranker_result' : evt.stage
  }
  return evt.stage || evt.event_type
}

function stageLabel(evt) {
  const k = stageKey(evt)
  return STAGE_CONFIG[k]?.label || k || evt.event_type || '—'
}

function dotClass(evt) {
  if (evt.status === 'error') return 'error'
  const k = stageKey(evt)
  return STAGE_CONFIG[k]?.dot || ''
}

// ── Detail panels ───────────────────────────────────────────────────

function LLMDetail({ evt }) {
  const meta = evt.metadata || {}
  return (
    <div className="sa-detail-panel">
      <div className="sa-detail-section">
        <div className="sa-detail-label">Model</div>
        <div className="sa-detail-value mono">{meta.model || '—'}</div>
      </div>
      <div className="sa-detail-grid">
        <div className="sa-detail-kpi">
          <div className="sa-detail-kpi-val">{evt.input_tokens ?? '—'}</div>
          <div className="sa-detail-kpi-sub">input tokens</div>
        </div>
        <div className="sa-detail-kpi">
          <div className="sa-detail-kpi-val">{evt.output_tokens ?? '—'}</div>
          <div className="sa-detail-kpi-sub">output tokens</div>
        </div>
        <div className="sa-detail-kpi">
          <div className="sa-detail-kpi-val">{fmtMs(evt.duration_ms)}</div>
          <div className="sa-detail-kpi-sub">latency</div>
        </div>
      </div>
      {evt.input_text && (
        <div className="sa-detail-section">
          <div className="sa-detail-label">Prompt sent to model</div>
          <div className="sa-detail-pre">
            <SmartContent text={evt.input_text} isOutput={false} />
          </div>
        </div>
      )}
      {evt.output_text && (
        <div className="sa-detail-section">
          <div className="sa-detail-label">Model response</div>
          <div className="sa-detail-pre output">
            <SmartContent text={evt.output_text} isOutput={true} />
          </div>
        </div>
      )}
    </div>
  )
}

const CHUNK_TYPE_COLORS = {
  text:   { bg: '#e8f4fd', color: '#1a6fa8' },
  table:  { bg: '#fef3e2', color: '#b45309' },
  figure: { bg: '#f0fdf4', color: '#166534' },
  hybrid: { bg: '#f3f0ff', color: '#5b21b6' },
}
function ChunkTypeBadge({ type }) {
  const t = (type || 'text').toLowerCase()
  const style = CHUNK_TYPE_COLORS[t] || { bg: '#f4f4f4', color: '#555' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: style.bg, color: style.color, textTransform: 'uppercase',
      letterSpacing: '0.04em', flexShrink: 0,
    }}>{t}</span>
  )
}

function StoreDetail({ evt }) {
  const meta = evt.metadata || {}
  const chunks = meta.chunks || []
  return (
    <div className="sa-detail-panel">
      <div className="sa-detail-grid">
        <div className="sa-detail-kpi">
          <div className="sa-detail-kpi-val">{meta.hit_count ?? '—'}</div>
          <div className="sa-detail-kpi-sub">chunks returned</div>
        </div>
        <div className="sa-detail-kpi">
          <div className="sa-detail-kpi-val">{fmtMs(evt.duration_ms)}</div>
          <div className="sa-detail-kpi-sub">latency</div>
        </div>
        {meta.was_empty && (
          <div className="sa-detail-kpi">
            <div className="sa-detail-kpi-val" style={{ color: 'var(--ember)' }}>EMPTY</div>
            <div className="sa-detail-kpi-sub">no results</div>
          </div>
        )}
        {meta.entity_matches !== undefined && (
          <div className="sa-detail-kpi">
            <div className="sa-detail-kpi-val">{meta.entity_matches}</div>
            <div className="sa-detail-kpi-sub">entities matched</div>
          </div>
        )}
        {meta.traversal_hits !== undefined && (
          <div className="sa-detail-kpi">
            <div className="sa-detail-kpi-val">{meta.traversal_hits}</div>
            <div className="sa-detail-kpi-sub">graph triples</div>
          </div>
        )}
      </div>
      {chunks.length > 0 && (
        <div className="sa-detail-section">
          <div className="sa-detail-label">Retrieved chunks (top {chunks.length})</div>
          <div className="sa-chunk-list">
            {chunks.map((c, i) => (
              <div key={i} className="sa-chunk-card">
                <div className="sa-chunk-head">
                  <span className="sa-chunk-doc" title={c.document_name}>{c.document_name || 'unknown'}</span>
                  <ChunkTypeBadge type={c.chunk_type} />
                  {c.chunk_index >= 0 && (
                    <span style={{ fontSize: 10, color: 'var(--ink-4)', flexShrink: 0 }}>chunk #{c.chunk_index}</span>
                  )}
                  {c.page_numbers && (
                    <span className="sa-meta-pill" style={{ fontSize: 10 }}>p.{c.page_numbers}</span>
                  )}
                  <span className="sa-chunk-score">{Number(c.score ?? 0).toFixed(4)}</span>
                </div>
                <div className="sa-chunk-text">{c.text_snippet}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RerankerDetail({ evt }) {
  const meta = evt.metadata || {}
  const scored = meta.scored_chunks || []
  return (
    <div className="sa-detail-panel">
      <div className="sa-detail-grid">
        <div className="sa-detail-kpi">
          <div className="sa-detail-kpi-val">{meta.input_count ?? '—'}</div>
          <div className="sa-detail-kpi-sub">chunks in</div>
        </div>
        <div className="sa-detail-kpi">
          <div className="sa-detail-kpi-val">{meta.output_count ?? '—'}</div>
          <div className="sa-detail-kpi-sub">chunks out</div>
        </div>
        <div className="sa-detail-kpi">
          <div className="sa-detail-kpi-val">{meta.top_score !== undefined ? Number(meta.top_score).toFixed(4) : '—'}</div>
          <div className="sa-detail-kpi-sub">top score</div>
        </div>
        <div className="sa-detail-kpi">
          <div className="sa-detail-kpi-val">{fmtMs(evt.duration_ms)}</div>
          <div className="sa-detail-kpi-sub">latency</div>
        </div>
      </div>
      {scored.length > 0 && (
        <div className="sa-detail-section">
          <div className="sa-detail-label">Ranked output chunks</div>
          <div className="sa-chunk-list">
            {scored.map((c, i) => (
              <div key={i} className="sa-chunk-card">
                <div className="sa-chunk-head">
                  <span className="sa-chunk-rank">#{i + 1}</span>
                  <span className="sa-chunk-doc" title={c.document_name}>{c.document_name || 'unknown'}</span>
                  <ChunkTypeBadge type={c.chunk_type} />
                  {c.chunk_index >= 0 && (
                    <span style={{ fontSize: 10, color: 'var(--ink-4)', flexShrink: 0 }}>chunk #{c.chunk_index}</span>
                  )}
                  {c.page_numbers && (
                    <span className="sa-meta-pill" style={{ fontSize: 10 }}>p.{c.page_numbers}</span>
                  )}
                  {c.source && <span className="sa-meta-pill" style={{ fontSize: 10 }}>{c.source}</span>}
                  <span className="sa-chunk-score">{Number(c.rerank_score ?? 0).toFixed(4)}</span>
                </div>
                <div className="sa-chunk-text">{c.text_snippet}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ReceivedDetail({ evt }) {
  const meta = evt.metadata || {}
  return (
    <div className="sa-detail-panel">
      <div className="sa-detail-section">
        <div className="sa-detail-label">Raw query</div>
        <div className="sa-detail-value" style={{ fontStyle: 'italic', fontSize: 15 }}>
          "{meta.raw_query || '—'}"
        </div>
      </div>
      {meta.turn_index !== undefined && (
        <div className="sa-detail-section">
          <div className="sa-detail-label">Turn index (0-based)</div>
          <div className="sa-detail-value mono">{meta.turn_index}</div>
        </div>
      )}
      <div className="sa-detail-section">
        <div className="sa-detail-label">Received at</div>
        <div className="sa-detail-value">{fmtDate(evt.created_at)}</div>
      </div>
    </div>
  )
}

function CompletedDetail({ evt, totalTokens }) {
  return (
    <div className="sa-detail-panel">
      <div className="sa-detail-grid">
        <div className="sa-detail-kpi">
          <div className="sa-detail-kpi-val">{fmtMs(evt.duration_ms)}</div>
          <div className="sa-detail-kpi-sub">total wall time</div>
        </div>
        <div className="sa-detail-kpi">
          <div className="sa-detail-kpi-val">{totalTokens.in}</div>
          <div className="sa-detail-kpi-sub">total input tokens</div>
        </div>
        <div className="sa-detail-kpi">
          <div className="sa-detail-kpi-val">{totalTokens.out}</div>
          <div className="sa-detail-kpi-sub">total output tokens</div>
        </div>
      </div>
      {(evt.metadata?.answer_found === false) && (
        <div className="sa-detail-section">
          <span className="sa-meta-pill error">Grounded refusal — no answer found in context</span>
        </div>
      )}
    </div>
  )
}

function ErrorDetail({ evt }) {
  return (
    <div className="sa-detail-panel">
      <div className="sa-detail-section">
        <div className="sa-detail-label">Error type</div>
        <div className="sa-detail-value" style={{ color: 'var(--ember)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          {evt.error_type}
        </div>
      </div>
      <div className="sa-detail-section">
        <div className="sa-detail-label">Error message</div>
        <div className="sa-detail-value">{evt.error_message}</div>
      </div>
      {evt.error_traceback && (
        <div className="sa-detail-section">
          <div className="sa-detail-label">Traceback</div>
          <pre className="sa-traceback" style={{ maxHeight: 400, overflow: 'auto' }}>{evt.error_traceback}</pre>
        </div>
      )}
    </div>
  )
}

function EventDetail({ evt, totalTokens }) {
  if (!evt) return <div className="sa-detail-empty">Select a stage on the left to see details.</div>
  if (evt.status === 'error') return <ErrorDetail evt={evt} />

  const k = stageKey(evt)
  if (k === 'received')   return <ReceivedDetail evt={evt} />
  if (k === 'completed')  return <CompletedDetail evt={evt} totalTokens={totalTokens} />
  if (k === 'reranker_result') return <RerankerDetail evt={evt} />

  const llmStages = ['rewrite', 'query_plan', 'answer', 'verification', 'refinement', 'citation', 'graph_entity_extraction']
  if (llmStages.includes(k)) return <LLMDetail evt={evt} />

  const storeStages = ['vector', 'bm25', 'graph']
  if (storeStages.includes(k)) return <StoreDetail evt={evt} />

  // fallback: render metadata as JSON viewer
  return (
    <div className="sa-detail-panel">
      <div className="sa-detail-section">
        <div className="sa-detail-label">Duration</div>
        <div className="sa-detail-value">{fmtMs(evt.duration_ms)}</div>
      </div>
      {evt.metadata && Object.keys(evt.metadata).length > 0 && (
        <div className="sa-detail-section">
          <div className="sa-detail-label">Metadata</div>
          <div className="sa-detail-pre">
            <JsonViewer data={evt.metadata} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────
export default function QueryDetail() {
  const { queryId } = useParams()
  const navigate    = useNavigate()

  const [trace,    setTrace]    = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    setLoading(true)
    saLogsQueryTrace(queryId)
      .then(d => { setTrace(d); setSelected(0) })
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [queryId])

  if (loading) return <div className="sa-content"><div className="sa-loading">Loading trace…</div></div>
  if (error)   return <div className="sa-content"><div className="sa-err-banner">{error}</div></div>
  if (!trace)  return null

  const events = trace.events || []

  const totalTokens = events.reduce((acc, e) => ({
    in:  acc.in  + (e.input_tokens  || 0),
    out: acc.out + (e.output_tokens || 0),
  }), { in: 0, out: 0 })

  const totalMs = events.find(e => e.stage === 'completed')?.duration_ms || null
  const selectedEvt = events[selected] || null

  return (
    /* Fixed overlay — sits flush to right of sidebar (220px), fills full viewport height */
    <div style={{
      position: 'fixed', top: 0, left: 220, right: 0, bottom: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--paper)', zIndex: 20,
    }}>
      {/* Top bar */}
      <div className="sa-topbar" style={{ position: 'relative', flexShrink: 0 }}>
        <div className="sa-topbar-left" style={{ gap: 10, alignItems: 'center', display: 'flex' }}>
          <button className="sa-back-btn" onClick={() => navigate(-1)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back
          </button>
          <div>
            <h1 className="sa-page-title" style={{ marginBottom: 2 }}>
              {trace.raw_query
                ? <span style={{ fontWeight: 500 }}>"{trace.raw_query}"</span>
                : 'Query Pipeline Trace'}
            </h1>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {trace.session_title && (
                <Link to={`/admin/sessions/${trace.session_id}`}
                      style={{ font: '400 12px var(--font-sans)', color: 'var(--current)' }}>
                  {trace.session_title}
                </Link>
              )}
              {trace.turn_index !== null && trace.turn_index !== undefined && (
                <span className="sa-meta-pill" style={{ fontSize: 11 }}>
                  Turn {trace.turn_index + 1}{trace.total_turns ? ` of ${trace.total_turns}` : ''}
                </span>
              )}
              {totalMs && <span className="sa-meta-pill">{fmtMs(totalMs)} total</span>}
              {totalTokens.in > 0 && <span className="sa-meta-pill token">in: {totalTokens.in} tok</span>}
              {totalTokens.out > 0 && <span className="sa-meta-pill token">out: {totalTokens.out} tok</span>}
              <span className="sa-meta-pill mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>
                {queryId.slice(0, 8)}…
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Two-panel body — fills all remaining height */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Left: timeline — fixed width, independent scroll */}
        <div style={{
          width: 320, minWidth: 260, flexShrink: 0,
          borderRight: '1px solid var(--mist-2)',
          overflowY: 'auto', padding: '12px 0',
          background: 'var(--paper-bright)',
        }}>
          {events.length === 0 && <div className="sa-empty">No events recorded.</div>}
          {(() => {
            let rerankerCount = 0
            return events.map((evt, i) => {
            const isSelected = i === selected
            const isError    = evt.status === 'error'
            const isReranker = stageKey(evt) === 'reranker_result'
            if (isReranker) rerankerCount++
            const rerankerIdx = isReranker ? rerankerCount : null
            const label      = isReranker ? `Reranker (branch ${rerankerIdx})` : stageLabel(evt)
            const dc         = dotClass(evt)
            const isLLM      = ['rewrite','query_plan','answer','verification','refinement','citation','graph_entity_extraction'].includes(stageKey(evt))
            const isStore    = ['vector','bm25','graph','reranker_result'].includes(stageKey(evt))

            return (
              <div key={i}
                   className={`sa-trace-row${isSelected ? ' selected' : ''}${isError ? ' error-row' : ''}`}
                   onClick={() => setSelected(i)}>
                <div className={`sa-timeline-dot ${dc}`} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={`sa-trace-label${isError ? ' err' : ''}`}>{label}</span>
                    {evt.duration_ms !== null && evt.duration_ms !== undefined && (
                      <span className="sa-timeline-dur" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                        {fmtMs(evt.duration_ms)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                    {isLLM && evt.input_tokens !== null && evt.input_tokens !== undefined && (
                      <span className="sa-meta-pill token" style={{ fontSize: 10 }}>
                        {evt.input_tokens}↑ {evt.output_tokens}↓
                      </span>
                    )}
                    {isStore && evt.metadata?.hit_count !== undefined && (
                      <span className="sa-meta-pill" style={{ fontSize: 10 }}>
                        hits: {evt.metadata.hit_count}
                      </span>
                    )}
                    {evt.metadata?.top_score !== undefined && (
                      <span className="sa-meta-pill" style={{ fontSize: 10 }}>
                        top: {Number(evt.metadata.top_score).toFixed(3)}
                      </span>
                    )}
                    {evt.metadata?.was_empty && (
                      <span className="sa-meta-pill error" style={{ fontSize: 10 }}>empty</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
          })()}
        </div>

        {/* Right: detail — fills remaining width, independent scroll */}
        <div style={{
          flex: 1, minWidth: 0,
          display: 'flex', flexDirection: 'column',
          background: 'var(--paper)',
        }}>
          {selectedEvt && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px 12px', borderBottom: '1px solid var(--mist-2)',
              flexShrink: 0,
            }}>
              <span className="sa-detail-stage-title">
                {stageKey(selectedEvt) === 'reranker_result'
                  ? `Reranker (branch ${events.slice(0, selected + 1).filter(e => stageKey(e) === 'reranker_result').length})`
                  : stageLabel(selectedEvt)}
              </span>
              <span style={{ font: '400 11px var(--font-sans)', color: 'var(--ink-4)' }}>
                {fmtDate(selectedEvt.created_at)}
              </span>
            </div>
          )}
          {/* Scrollable detail content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <EventDetail evt={selectedEvt} totalTokens={totalTokens} />
          </div>
        </div>

      </div>
    </div>
  )
}
