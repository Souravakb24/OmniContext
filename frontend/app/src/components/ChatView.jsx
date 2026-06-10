import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { useAuth } from '../AuthContext.jsx'
import * as api from '../api.js'
import { useToast } from './Toast.jsx'
import ReactMarkdown from 'react-markdown'
import { answerRemarkPlugins, answerRehypePlugins, normalizeMath } from '../markdown.js'

// ─── constants ───────────────────────────────────────────────────────────────

const AGENT_LABELS = {
  query_rewriter:     'Understanding your question',
  query_planner:      'Planning search strategy',
  retrieval_agent:    'Searching knowledge base',
  answer_agent:       'Generating answer',
  verification_agent: 'Verifying answer quality',
  refinement_agent:   'Refining search',
  citation_agent:     'Extracting citations',
  no_context:         'No relevant content found',
}

const TYPE_COLORS = {
  Model: '#2E6F8E', Technique: '#5C7A4F', Concept: '#D9B271',
  Organisation: '#C24A3A', Person: '#7A5A9E', default: '#5A6878',
}

// When false, inline answer figures render only under the latest answer (matches
// how citations/score behave). Flip to true to show them under every turn in
// history — the backend already persists per-turn figure paths to support this.
const FIGURES_ON_ALL_TURNS = false

function fmtRelative(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── tiny icon helpers ────────────────────────────────────────────────────────

const Icon = ({ d, w = 16 }) => (
  <svg viewBox="0 0 24 24" width={w} height={w} fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d={d} />
  </svg>
)

const Mark = ({ size = 26 }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
    <rect width="64" height="64" rx="14" style={{ fill: 'var(--ink)' }} />
    <path d="M 10 36 C 18 24, 24 44, 32 32 S 46 20, 54 32" fill="none" style={{ stroke: 'var(--paper)' }} strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="32" cy="32" r="3.2" style={{ fill: 'var(--sand)' }} />
  </svg>
)

// ─── ScoreBadge ───────────────────────────────────────────────────────────────

const ScoreBadge = ({ score, iters }) => {
  if (score == null) return null
  const pct = Math.round(score * 100)
  const tone = pct >= 90 ? 'moss' : pct >= 75 ? 'sand' : 'ember'
  return (
    <div className="score-row">
      <span className={`pill pill-${tone}`}><span className="pill-dot" />Verified {pct}%</span>
      {iters != null && <span className="quiet">{iters} iteration{iters === 1 ? '' : 's'}</span>}
    </div>
  )
}

// ─── AnswerFigures ────────────────────────────────────────────────────────────

// Inline figures shown directly under the answer. Sourced from figure-type
// citations that carry an image (figure_b64, inlined by the backend from the
// per-turn copied file). Clicking opens the full viewer on the figure's page.
const AnswerFigure = ({ citation, onOpen }) => {
  const [showCap, setShowCap] = useState(false)
  return (
    <figure className="answer-figure">
      <button className="answer-figure-btn" onClick={() => onOpen(citation)} title="Open in source viewer">
        <img src={citation.figure_b64} alt={citation.caption || 'Figure from source'} loading="lazy" />
      </button>
      {citation.caption && (
        <>
          <button className="answer-figure-captoggle" onClick={() => setShowCap(s => !s)}>
            <Icon d={showCap ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} w={14} />
            Read caption
          </button>
          {showCap && <figcaption className="answer-figure-cap quiet">{citation.caption}</figcaption>}
        </>
      )}
    </figure>
  )
}

const AnswerFigures = ({ citations, onOpen }) => {
  if (!citations || !citations.length) return null
  const figures = citations.filter(c => c.chunk_type === 'figure' && c.figure_b64)
  if (!figures.length) return null

  return (
    <div className="answer-figures">
      {figures.map((c, i) => (
        <AnswerFigure key={c.chunk_id || i} citation={c} onOpen={onOpen} />
      ))}
    </div>
  )
}

// ─── CitationList ─────────────────────────────────────────────────────────────

function resolveDocName(doc_id, docMap, headings) {
  if (docMap[doc_id]) return docMap[doc_id]
  if (headings) {
    const base = headings.split(/[:–—]/)[0].trim()
    if (base.length > 2) return base.length > 48 ? base.slice(0, 48) + '…' : base
  }
  return doc_id.slice(0, 8) + '…'
}

const CitationList = ({ citations, onOpen, activeCite, docMap = {} }) => {
  const [open, setOpen] = useState(true)
  if (!citations || !citations.length) return null
  const resolveName = (c) => resolveDocName(c.document_name, docMap, c.headings)

  // Figures first, then page chunks — stable within each group
  const sorted = [...citations].sort((a, b) => {
    const aFig = a.chunk_type === 'figure' ? 0 : 1
    const bFig = b.chunk_type === 'figure' ? 0 : 1
    return aFig - bFig
  })

  return (
    <div className="cites">
      <button className="cites-toggle" onClick={() => setOpen(o => !o)}>
        <Icon d={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} w={14} />
        Sources ({sorted.length})
      </button>
      {open && (
        <div className="cites-list">
          {sorted.map((c, i) => {
            const active = !!(activeCite && c.chunk_id && activeCite.chunk_id === c.chunk_id)
            const name = resolveName(c)
            const section = c.headings ? c.headings.split(' > ').pop() : null
            const isFigure = c.chunk_type === 'figure'
            return (
              <button key={c.chunk_id || i} className={`cite-row${active ? ' active' : ''}`} onClick={() => onOpen(c)}>
                <span className="cite-num">{i + 1}</span>
                <span className="cite-row-body">
                  <span className="cite-row-name">
                    {isFigure && (
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ marginRight: 4, color: 'var(--sand)', flexShrink: 0 }}>
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
                      </svg>
                    )}
                    {name}
                  </span>
                  {section && <span className="cite-row-section quiet">{section}</span>}
                </span>
                <span className="cite-row-right">
                  {isFigure
                    ? <span className="cite-row-page" style={{ color: 'var(--sand)' }}>fig</span>
                    : c.page_numbers && <span className="cite-row-page">p.{c.page_numbers}</span>
                  }
                  <Icon d="M9 18l6-6-6-6" w={13} />
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── PageCanvas ───────────────────────────────────────────────────────────────

const PageCanvas = ({ page, view, onView }) => {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !page?.image_b64) return
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      canvas.width  = page.width_px
      canvas.height = page.height_px
      ctx.drawImage(img, 0, 0)
      ctx.fillStyle   = 'rgba(255, 213, 0, 0.28)'
      ctx.strokeStyle = 'rgba(190, 130, 0, 0.72)'
      ctx.lineWidth   = 2.5
      for (const b of page.bboxes || []) {
        const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1)
        const y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1)
        if (x1 > x0 && y1 > y0) {
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
          ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
        }
      }
    }
    img.src = page.image_b64
  }, [page])

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 4 }} />
}

// ─── EvidencePanel ────────────────────────────────────────────────────────────

const DocIcon = () => (
  <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden>
    <path d="M8 4h12l6 6v18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" style={{ stroke: 'var(--ember)' }} strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M20 4v6h6" fill="none" style={{ stroke: 'var(--ember)' }} strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
)

const EvidencePanel = ({ open, citation, data, loading, error, errorMsg, onClose, docMap = {}, panelWidth, onStartResize }) => {
  const filename = data?.doc_name
    || (citation && resolveDocName(citation.document_name, docMap, citation.headings))
    || 'Source'
  const headings = data?.headings || citation?.headings || null
  const pages    = data?.pages || []

  const [zoom, setZoom] = useState(1)
  useEffect(() => { setZoom(1) }, [data])

  const zoomIn    = () => setZoom(z => Math.min(2.5, parseFloat((z + 0.25).toFixed(2))))
  const zoomOut   = () => setZoom(z => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))))
  const zoomReset = () => setZoom(1)

  return (
    <div className={`ev-panel${open ? ' open' : ''}`} style={{ width: open ? panelWidth : 0 }} aria-hidden={!open}>
      {open && <div className="ev-resize-handle" onMouseDown={onStartResize} />}
      <div className="ev-panel-inner" style={{ width: panelWidth }}>

        {/* header */}
        <div className="ev-head">
          <div className="ev-head-info">
            <DocIcon />
            <div className="ev-head-text">
              <b title={filename}>{filename}</b>
              {headings && <span className="quiet ev-section">{headings}</span>}
            </div>
          </div>
          <div className="ev-head-actions">
            {data && (
              <div className="ev-zoom-controls">
                <button className="ev-zoom-btn" onClick={zoomOut} disabled={zoom <= 0.5} title="Zoom out">−</button>
                <button className="ev-zoom-reset" onClick={zoomReset} title="Reset zoom">{Math.round(zoom * 100)}%</button>
                <button className="ev-zoom-btn" onClick={zoomIn} disabled={zoom >= 2.5} title="Zoom in">+</button>
              </div>
            )}
            <button className="icon-btn" onClick={onClose} aria-label="Close source panel">
              <Icon d="M6 6l12 12M18 6 6 18" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="ev-body">

          {loading && (
            <div className="ev-loading">
              <span className="agentspin dark" style={{ width: 18, height: 18, borderWidth: 2 }} />
              <span className="quiet">Loading page…</span>
            </div>
          )}

          {!loading && !data && (
            <div className="ev-empty">
              <Icon d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" w={22} />
              {error === 'no_chunk_id' && (
                <p className="quiet">This citation is missing a chunk ID — the answer was likely generated before the PDF viewer was enabled. Re-run the query to get page evidence.</p>
              )}
              {error === 'not_found' && (
                <p className="quiet">Chunk not found in the database (404). The document may have been re-indexed since this answer was generated.</p>
              )}
              {(error === 'fetch_error' || (!error && !data)) && (
                <p className="quiet">Could not load page evidence.{errorMsg ? ` (${errorMsg})` : ''}</p>
              )}
            </div>
          )}

          {!loading && data && (
            <div className="ev-pages" style={{ zoom }}>
              {pages.length === 0 && (
                <p className="quiet" style={{ padding: '20px 16px' }}>No page image available for this chunk.</p>
              )}
              {pages.map((page, i) => (
                <div key={i} className="ev-page-item">
                  <div className="ev-page-label quiet">Page {page.page_no}</div>
                  <PageCanvas page={page} />
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── AgentProgress ────────────────────────────────────────────────────────────

// ─── AgentProgress ────────────────────────────────────────────────────────────

const AgentProgress = ({ steps }) => (
  <div className="agentbar">
    {steps.map((s, i) => (
      <div key={i} className={`agentstep is-${s.state}`}>
        <span className="agenttick">
          {s.state === 'done' && <Icon d="M20 6L9 17l-5-5" w={11} />}
          {s.state === 'active' && <span className="agentspin" />}
        </span>
        <span className="agentlabel">{s.label}{s.state === 'active' ? '…' : ''}</span>
      </div>
    ))}
  </div>
)

// ─── InteractiveGraph ─────────────────────────────────────────────────────────

const InteractiveGraph = ({ graph }) => {
  const nodes = graph?.nodes || []
  const edges = graph?.edges || []
  if (!nodes.length) {
    return (
      <div className="kg">
        <div className="kg-head"><span className="kg-title">Knowledge graph</span></div>
        <div className="kg-empty">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="5" cy="12" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="19" cy="19" r="3"/><path d="M8 11l8-5M8 13l8 5"/></svg>
          <span>No entities found in the graph for this query.</span>
        </div>
      </div>
    )
  }
  return <GraphCanvas nodes={nodes} edges={edges} />
}

const GraphCanvas = ({ nodes, edges }) => {
  const wrapRef = useRef(null)
  const dragId = useRef(null)
  const [dims, setDims] = useState({ w: 560, h: 320 })
  const [base, setBase] = useState({})
  const [hover, setHover] = useState(null)
  const [tick, setTick] = useState(0)

  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return
    const w = el.clientWidth || 560, h = 320
    setDims({ w, h })
    const n = nodes.length
    if (n === 0) { setBase({}); return }

    // seed positions: deterministic scatter using node index + golden angle
    const cx = w / 2, cy = h / 2
    const sim = {}
    nodes.forEach((nd, i) => {
      const angle = i * 2.399963  // golden angle in radians
      const radius = 30 + (i % 3) * 60 + Math.floor(i / 3) * 40
      sim[nd.id] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle) * 0.7,
        vx: 0, vy: 0,
      }
    })

    // force simulation — repulsion + edge attraction + center gravity
    const REPEL = 5000, ATTRACT = 0.05, CENTER = 0.006, DAMP = 0.82
    for (let iter = 0; iter < 320; iter++) {
      nodes.forEach(nd => { sim[nd.id].fx = 0; sim[nd.id].fy = 0 })

      // pairwise repulsion
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = sim[nodes[i].id], b = sim[nodes[j].id]
          const dx = b.x - a.x, dy = b.y - a.y
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          const f = REPEL / (d * d)
          a.fx -= (dx / d) * f; a.fy -= (dy / d) * f
          b.fx += (dx / d) * f; b.fy += (dy / d) * f
        }
      }

      // edge attraction (spring)
      edges.forEach(e => {
        const a = sim[e.source], b = sim[e.target]
        if (!a || !b) return
        const dx = b.x - a.x, dy = b.y - a.y
        a.fx += dx * ATTRACT; a.fy += dy * ATTRACT
        b.fx -= dx * ATTRACT; b.fy -= dy * ATTRACT
      })

      // gentle center gravity
      nodes.forEach(nd => {
        sim[nd.id].fx += (cx - sim[nd.id].x) * CENTER
        sim[nd.id].fy += (cy - sim[nd.id].y) * CENTER
      })

      // integrate
      nodes.forEach(nd => {
        const s = sim[nd.id]
        s.vx = (s.vx + s.fx) * DAMP
        s.vy = (s.vy + s.fy) * DAMP
        s.x = Math.max(44, Math.min(w - 44, s.x + s.vx))
        s.y = Math.max(22, Math.min(h - 22, s.y + s.vy))
      })
    }

    const result = {}
    nodes.forEach(nd => { result[nd.id] = { x: sim[nd.id].x, y: sim[nd.id].y } })
    setBase(result)
  }, [nodes, edges])

  useEffect(() => {
    let raf, on = true
    const loop = t => { if (!on) return; setTick(t / 1000); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { on = false; cancelAnimationFrame(raf) }
  }, [])

  const phase = id => { let s = 0; for (let i = 0; i < id.length; i++) s += id.charCodeAt(i); return s % 100 }
  const rp = id => {
    const b = base[id]; if (!b) return { x: 0, y: 0 }
    if (dragId.current === id) return b
    const ph = phase(id)
    return { x: b.x + Math.cos(tick * 0.6 + ph) * 3.5, y: b.y + Math.sin(tick * 0.85 + ph) * 3.5 }
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

  const onDown = (id, e) => { e.preventDefault(); dragId.current = id; setHover(id) }
  const onMove = e => {
    if (!dragId.current) return
    const r = wrapRef.current.getBoundingClientRect()
    setBase(p => ({ ...p, [dragId.current]: { x: clamp(e.clientX - r.left, 20, dims.w - 20), y: clamp(e.clientY - r.top, 22, dims.h - 18) } }))
  }
  const onUp = () => { dragId.current = null }

  const litNode = id => !hover || id === hover || edges.some(e => (e.source === hover && e.target === id) || (e.target === hover && e.source === id))
  const litEdge = e => !hover || e.source === hover || e.target === hover

  return (
    <div className="kg">
      <div className="kg-head">
        <span className="kg-title">Knowledge graph</span>
        <span className="quiet">{nodes.length} entities · {edges.length} relations · drag a node</span>
      </div>
      <div className="kg-canvas" ref={wrapRef} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
        <svg className="kg-edges" width={dims.w} height={dims.h}>
          {edges.map((e, i) => {
            const a = rp(e.source), b = rp(e.target)
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
            const lit = litEdge(e)
            return (
              <g key={i} opacity={lit ? 1 : 0.14}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hover && lit ? 'var(--current)' : 'var(--mist-2)'} strokeWidth={hover && lit ? 1.7 : 1} />
                <rect x={mx - (e.relation.length * 3 + 4)} y={my - 9} width={e.relation.length * 6 + 8} height={13} rx={3} fill="var(--paper-bright)" opacity={lit ? 0.9 : 0} />
                <text x={mx} y={my + 1} textAnchor="middle" className="kg-edge-label" opacity={lit ? 1 : 0}>{e.relation}</text>
              </g>
            )
          })}
        </svg>
        {nodes.map(nd => {
          const p = rp(nd.id)
          const col = TYPE_COLORS[nd.type] || TYPE_COLORS.default
          const lit = litNode(nd.id)
          return (
            <div key={nd.id} className={`kg-node ${dragId.current === nd.id ? 'is-drag' : ''}`}
              style={{ left: p.x, top: p.y, opacity: lit ? 1 : 0.28, zIndex: hover === nd.id ? 6 : 2 }}
              onPointerDown={e => onDown(nd.id, e)}
              onPointerEnter={() => !dragId.current && setHover(nd.id)}
              onPointerLeave={() => !dragId.current && setHover(null)}>
              <span className="kg-dot" style={{ background: col }} />
              <span className="kg-label">{nd.id}</span>
            </div>
          )
        })}
      </div>
      <div className="kg-legend">
        {[...new Set(nodes.map(n => n.type))].map(t => (
          <span key={t} className="kg-legend-item">
            <span className="dot" style={{ background: TYPE_COLORS[t] || TYPE_COLORS.default }} />{t}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── CollectionPickerModal ────────────────────────────────────────────────────

const CollectionPickerModal = ({ onCancel, onStart }) => {
  const [collections, setCollections] = useState([])
  const [picked, setPicked] = useState('')
  const [isGraph, setIsGraph] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getMyCollections().then(data => {
      setCollections(data)
      if (data.length) setPicked(data[0].collection_id)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const sel = collections.find(c => c.collection_id === picked)

  const handleStart = () => {
    if (!sel) return
    onStart(sel.name, isGraph)
  }

  return (
    <>
      <div className="modal-scrim" onClick={onCancel} />
      <div className="modal" role="dialog" aria-modal="true">
        <header className="modal-head">
          <h3>Start a new chat</h3>
          <button className="icon-btn" onClick={onCancel} aria-label="Close"><Icon d="M6 6l12 12M18 6 6 18" /></button>
        </header>
        <div className="modal-body">
          {loading ? <p className="quiet">Loading collections…</p> : (
            <>
              <label className="field">
                <span className="field-label">Collection</span>
                <select value={picked} onChange={e => setPicked(e.target.value)}>
                  {collections.length === 0 && <option value="">No collections yet</option>}
                  {collections.map(c => (
                    <option key={c.collection_id} value={c.collection_id}>{c.name} ({c.doc_count} docs)</option>
                  ))}
                </select>
                <span className="quiet">The chat is locked to this collection once it starts.</span>
              </label>
              <label className={`graphopt ${(!sel || sel.doc_count === 0) ? 'is-disabled' : ''} ${isGraph ? 'on' : ''}`}>
                <input type="checkbox" checked={isGraph} disabled={!sel || sel.doc_count === 0} onChange={e => setIsGraph(e.target.checked)} />
                <span className="graphopt-box"><Icon d="M20 6L9 17l-5-5" w={12} /></span>
                <span>
                  <b>Enable knowledge graph</b>
                  <span className="quiet">Surface entities and relations alongside answers.</span>
                </span>
              </label>
            </>
          )}
        </div>
        <footer className="modal-foot">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={!picked || !sel} onClick={handleStart}>Start chat</button>
        </footer>
      </div>
    </>
  )
}

// ─── TurnMessage ──────────────────────────────────────────────────────────────

const TurnMessage = ({ turn, isLast, graphUi, isGraph, onOpenEvidence, activeCite, docMap }) => (
  <div className="turn">
    <div className="msg msg-user">
      <div className="msg-body">{turn.rawQuery}</div>
    </div>
    <div className="msg msg-ai">
      <span className="msg-avatar"><Mark /></span>
      <div className="msg-body">
        <div className="md-answer">
          <ReactMarkdown remarkPlugins={answerRemarkPlugins} rehypePlugins={answerRehypePlugins}>{normalizeMath(turn.finalAnswer || '')}</ReactMarkdown>
        </div>
        {isLast && !turn.noAnswer && <ScoreBadge score={turn.verificationScore} iters={turn.iterationsUsed} />}
        {(isLast || FIGURES_ON_ALL_TURNS) && <AnswerFigures citations={turn.citations} onOpen={onOpenEvidence} />}
        {isLast && <CitationList citations={turn.citations} onOpen={onOpenEvidence} activeCite={activeCite} docMap={docMap} />}
        {isLast && isGraph && graphUi && <InteractiveGraph graph={graphUi} />}
      </div>
    </div>
  </div>
)

// ─── Main ChatView ────────────────────────────────────────────────────────────

export default function ChatView({ initialCollection = null, initialDoc = null }) {
  const { token } = useAuth()
  const showToast = useToast()

  // Single-document scope — when set, retrieval is locked to one document.
  // { docId, docName } | null
  const [docScope, setDocScope] = useState(initialDoc)

  // doc id → filename map for resolving citation document_name UUIDs
  const [docMap, setDocMap] = useState({})
  useEffect(() => {
    api.getMyDocuments().then(docs => {
      setDocMap(Object.fromEntries(docs.map(d => [d.doc_id, d.filename])))
    }).catch(() => {})
  }, [])

  // conversation list
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [renameModal, setRenameModal] = useState(null)   // conv object
  const [renameTitle, setRenameTitle] = useState('')
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const [clearAllConfirm, setClearAllConfirm] = useState(false)
  const [deleteConvConfirm, setDeleteConvConfirm] = useState(null)  // conversation object

  // active chat state — pre-fill from prop if coming from a collection card
  const [collectionName, setCollectionName] = useState(initialCollection)
  const [isGraph, setIsGraph] = useState(false)
  const [turns, setTurns] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [graphUi, setGraphUi] = useState(null)

  // streaming
  const [streaming, setStreaming] = useState(false)
  const [agentSteps, setAgentSteps] = useState([])

  // UI
  const [picker, setPicker] = useState(false)
  const [input, setInput] = useState('')
  const [loadingHist, setLoadingHist] = useState(false)
  const [error, setError] = useState('')

  // evidence panel state
  const [ev, setEv] = useState({ open: false, citation: null, data: null, loading: false, pageIndex: 0 })

  // resizable panel
  const [panelWidth, setPanelWidth] = useState(540)
  const panelWidthRef = useRef(540)
  useEffect(() => { panelWidthRef.current = panelWidth }, [panelWidth])

  const threadRef = useRef()
  const abortRef = useRef(null)

  // scroll to bottom helper — useLayoutEffect so it fires before paint
  const [scrollSignal, setScrollSignal] = useState(0)
  const scrollToBottom = useCallback(() => setScrollSignal(s => s + 1), [])
  useLayoutEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [scrollSignal])

  // load conversation list on mount
  useEffect(() => {
    api.listConversations().then(setConversations).catch(() => {})
  }, [])

  // evidence panel handlers
  const openEvidence = useCallback(async (citation) => {
    console.log('[evidence] citation clicked:', citation)
    if (!citation.chunk_id) {
      console.warn('[evidence] chunk_id missing from citation — LLM did not output it for this citation')
      setEv({ open: true, citation, data: null, loading: false, pageIndex: 0, error: 'no_chunk_id' })
      return
    }
    setEv({ open: true, citation, data: null, loading: true, pageIndex: 0, error: null })
    try {
      const data = await api.getEvidence(citation.chunk_id)
      console.log('[evidence] response:', data)
      setEv(s => ({ ...s, data, loading: false, error: null }))
    } catch (err) {
      console.error('[evidence] fetch failed:', err.status, err.message)
      setEv(s => ({ ...s, loading: false, error: err.status === 404 ? 'not_found' : 'fetch_error', errorMsg: err.message }))
    }
  }, [])

  const closeEvidence  = useCallback(() => setEv(s => ({ ...s, open: false })), [])
  const prevEv         = useCallback(() => setEv(s => ({ ...s, pageIndex: Math.max(0, s.pageIndex - 1) })), [])
  const nextEv         = useCallback(() => setEv(s => ({ ...s, pageIndex: Math.min((s.data?.pages.length || 1) - 1, s.pageIndex + 1) })), [])

  // Keyboard shortcut: Esc = close panel
  useEffect(() => {
    if (!ev.open) return
    const onKey = (e) => { if (e.key === 'Escape') closeEvidence() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ev.open, closeEvidence])

  // Drag-to-resize the evidence panel from its left edge
  const startResize = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = panelWidthRef.current
    const onMove = (mv) => {
      const delta = startX - mv.clientX
      setPanelWidth(Math.max(320, Math.min(800, startW + delta)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // open a past conversation
  const openConversation = useCallback(async (conv) => {
    setActiveId(conv.session_id)
    setCollectionName(conv.collection_name)
    setDocScope(conv.doc_id ? { docId: conv.doc_id, docName: conv.doc_name } : null)
    setIsGraph(conv.is_graph)
    setGraphUi(null)
    setEv(s => ({ ...s, open: false }))
    setTurns([])
    setHasMore(false)
    setCurrentPage(1)
    setLoadingHist(true)
    try {
      const data = await api.getConversationHistory(conv.session_id, 1, 10)
      setTurns(data.turns.map(normalizeTurn))
      setHasMore(data.has_more)
      setCurrentPage(1)
      scrollToBottom()
    } catch {}
    setLoadingHist(false)
  }, [scrollToBottom])

  // load older turns (infinite scroll)
  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingHist || !activeId) return
    setLoadingHist(true)
    const el = threadRef.current
    const prevH = el ? el.scrollHeight : 0
    try {
      const nextPage = currentPage + 1
      const data = await api.getConversationHistory(activeId, nextPage, 10)
      setTurns(t => [...data.turns.map(normalizeTurn), ...t])
      setHasMore(data.has_more)
      setCurrentPage(nextPage)
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH })
    } catch {}
    setLoadingHist(false)
  }, [hasMore, loadingHist, activeId, currentPage])

  const onScroll = e => { if (e.target.scrollTop < 60) loadOlder() }

  // start new chat after collection picked
  const handleStart = (name, graph) => {
    setPicker(false)
    setActiveId(null)
    setCollectionName(name)
    setDocScope(null)   // picker starts a collection-wide chat
    setIsGraph(graph)
    setGraphUi(null)
    setEv(s => ({ ...s, open: false }))
    setTurns([])
    setHasMore(false)
    setCurrentPage(1)
    setAgentSteps([])
    scrollToBottom()
  }

  // send query
  const send = async () => {
    const q = input.trim()
    if (!q || streaming || !collectionName) return
    setInput('')
    setError('')
    setStreaming(true)
    setAgentSteps([])

    // optimistic user turn
    const optimistic = { rawQuery: q, finalAnswer: '', citations: null, verificationScore: null, iterationsUsed: null, pending: true }
    setTurns(prev => [...prev.map(t => ({ ...t, citations: null, verificationScore: null, iterationsUsed: null })), optimistic])
    scrollToBottom()

    let sessionId = activeId
    let finalAnswer = ''
    let citations = null
    let verificationScore = null
    let iterationsUsed = null
    let newGraphUi = null
    let noAnswer = false

    try {
      await api.sendQuery(q, collectionName, sessionId, isGraph, (event) => {
        if (event.event === 'session_start') {
          sessionId = event.session_id
          setActiveId(event.session_id)
          // add to conversation list if new
          if (!activeId) {
            const newConv = {
              session_id: event.session_id,
              title: q.slice(0, 60),
              collection_name: collectionName,
              doc_id: docScope?.docId || null,
              doc_name: docScope?.docName || null,
              is_graph: isGraph,
              turn_count: 1,
              last_active: new Date().toISOString(),
            }
            setConversations(cs => [newConv, ...cs])
          }
        } else if (event.event === 'start' || event.event === 'progress' || event.event === 'done') {
          const label = AGENT_LABELS[event.agent] || event.agent
          setAgentSteps(prev => {
            const existing = prev.findIndex(s => s.agent === event.agent)
            const step = { agent: event.agent, label, state: event.event === 'done' ? 'done' : 'active' }
            if (existing === -1) return [...prev.map(s => s.state === 'active' ? { ...s, state: 'done' } : s), step]
            return prev.map((s, i) => i === existing ? step : s)
          })
          if (event.event === 'done') {
            if (event.agent === 'answer_agent' && event.answer) finalAnswer = event.answer
            if (event.agent === 'verification_agent') { verificationScore = event.score ?? null; iterationsUsed = event.iterations_used ?? null }
            if (event.agent === 'citation_agent' && event.citations) citations = event.citations
          }
        } else if (event.event === 'stream_end') {
          if (event.no_answer) {
            // Grounded refusal — no citations, score, or graph for this turn.
            noAnswer = true
            newGraphUi = null
          } else {
            // Use graph_ui from event; fall back to empty sentinel so the
            // "no entities" message shows when graph was requested but store returned nothing
            newGraphUi = event.graph_ui || (isGraph ? { nodes: [], edges: [] } : null)
          }
          setGraphUi(newGraphUi)
        } else if (event.event === 'error') {
          setError(event.detail || 'Something went wrong.')
        }
      }, docScope?.docId)
    } catch (err) {
      setError(err.message || 'Stream failed.')
    }

    // Backend writes answer/citations/score to DB before sending stream_end,
    // but SSE events only carry metadata (answer_length, citation_count) — not
    // the actual text. Fetch the saved turn now; DB write is already committed.
    if (sessionId) {
      try {
        const hist = await api.getConversationHistory(sessionId, 1, 1)
        if (hist.turns && hist.turns.length > 0) {
          const saved = normalizeTurn(hist.turns[0])
          if (saved.finalAnswer)              finalAnswer       = saved.finalAnswer
          if (saved.citations)               citations         = saved.citations
          if (saved.verificationScore != null) verificationScore = saved.verificationScore
          if (saved.iterationsUsed   != null) iterationsUsed   = saved.iterationsUsed
        }
      } catch {}
    }

    // finalize the turn
    setTurns(prev => prev.map((t, i) =>
      i === prev.length - 1
        ? { ...t, pending: false, finalAnswer, citations, verificationScore, iterationsUsed, noAnswer }
        : t
    ))

    // update conversation list
    setConversations(cs => cs.map(c =>
      c.session_id === sessionId
        ? { ...c, turn_count: c.turn_count + 1, last_active: new Date().toISOString() }
        : c
    ))

    setStreaming(false)
    setAgentSteps([])
    scrollToBottom()

    // Auto-open PDF panel with first citation
    if (citations && citations.length > 0) {
      openEvidence(citations[0])
    }

  }

  const deleteConv = async () => {
    if (!deleteConvConfirm) return
    try {
      await api.deleteConversation(deleteConvConfirm.session_id)
      setConversations(cs => cs.filter(c => c.session_id !== deleteConvConfirm.session_id))
      if (activeId === deleteConvConfirm.session_id) {
        setActiveId(null); setCollectionName(null); setTurns([]); setHasMore(false)
      }
      setDeleteConvConfirm(null)
      showToast('Conversation deleted.')
    } catch (err) { showToast(err.message, 'error') }
  }

  const deleteAll = async () => {
    try {
      await api.deleteAllConversations()
      setConversations([])
      setActiveId(null); setCollectionName(null); setTurns([]); setHasMore(false)
      setClearAllConfirm(false)
      showToast('All conversations cleared.')
    } catch (err) { showToast(err.message, 'error') }
  }

  const openRenameModal = (c) => {
    setRenameTitle(c.title || '')
    setRenameModal(c)
    setMenuOpenId(null)
  }

  const commitRename = async () => {
    if (!renameModal) return
    const title = renameTitle.trim()
    if (!title) { setRenameModal(null); return }
    try {
      const res = await api.renameConversation(renameModal.session_id, title)
      setConversations(cs => cs.map(c => c.session_id === res.session_id ? { ...c, title: res.title } : c))
      showToast('Conversation renamed.')
    } catch (err) { showToast(err.message, 'error') }
    setRenameModal(null)
  }

  const onKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  return (
    <div className="chat">
      {/* ── conversation rail ── */}
      <div className="chat-rail">
        <button className="btn btn-primary btn-block newchat-btn" onClick={() => setPicker(true)}>
          <Icon d="M12 5v14M5 12h14" w={16} /> New chat
        </button>
        <div className="rail-label-row">
          <p className="rail-label">Conversations</p>
          {conversations.length > 0 && (
            <button className="link link-quiet" style={{ fontSize: 11 }} onClick={() => setClearAllConfirm(true)}>Clear all</button>
          )}
        </div>
        <div className="rail-list">
          {conversations.length === 0 && (
            <p className="quiet" style={{ padding: '8px 12px' }}>No chats yet. Start one above.</p>
          )}
          {conversations.map(c => (
            <div key={c.session_id} className={`conv-wrap ${activeId === c.session_id ? 'active' : ''}`}>
              <button className="conv" onClick={() => { openConversation(c); setMenuOpenId(null) }}>
                <span className="conv-title">{c.title || 'Untitled chat'}</span>
                <span className="conv-meta">
                  <span className="conv-coll" title={c.doc_name ? `${c.collection_name} · ${c.doc_name}` : c.collection_name}>
                    {c.collection_name}
                  </span>
                  {c.is_graph && (
                    <span className="conv-graph" title="Knowledge graph">
                      <Icon d="M5 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM13 5a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM13 19a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM11 12h2M11 12l5-4M11 12l5 4" w={12} />
                    </span>
                  )}
                </span>
                <span className="conv-sub quiet">{c.turn_count} turn{c.turn_count !== 1 ? 's' : ''} · {fmtRelative(c.last_active)}</span>
              </button>

              <div className="conv-menu-wrap">
                <button
                  className="icon-btn conv-action-btn conv-dots"
                  onClick={e => {
                    e.stopPropagation()
                    const r = e.currentTarget.getBoundingClientRect()
                    const menuW = 160, menuH = 90
                    let left = r.left
                    let top = r.bottom + 4
                    if (left + menuW > window.innerWidth - 8) left = r.right - menuW
                    if (top + menuH > window.innerHeight - 8) top = r.top - menuH - 4
                    setMenuPos({ top: Math.max(8, top), left: Math.max(8, left) })
                    setMenuOpenId(id => id === c.session_id ? null : c.session_id)
                  }}
                  title="Options"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
                  </svg>
                </button>

              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fixed dropdown menu — rendered outside overflow containers */}
      {menuOpenId && (
        <>
          <div className="conv-menu-scrim" onClick={() => setMenuOpenId(null)} />
          <div className="conv-menu" style={{ top: menuPos.top, left: menuPos.left }}>
            <button className="conv-menu-item" onClick={() => {
              const c = conversations.find(c => c.session_id === menuOpenId)
              if (c) openRenameModal(c)
            }}>
              <Icon d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" w={13} />
              Rename
            </button>
            <button className="conv-menu-item conv-menu-danger" onClick={() => {
              const c = conversations.find(c => c.session_id === menuOpenId)
              if (c) { setDeleteConvConfirm(c); setMenuOpenId(null) }
            }}>
              <Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" w={13} />
              Delete
            </button>
          </div>
        </>
      )}

      {renameModal && (
        <>
          <div className="modal-scrim" onClick={() => setRenameModal(null)} />
          <div className="modal" role="dialog">
            <header className="modal-head">
              <h3>Rename conversation</h3>
              <button className="icon-btn" onClick={() => setRenameModal(null)}><Icon d="M6 6l12 12M18 6 6 18" /></button>
            </header>
            <div className="modal-body">
              <label className="field">
                <span className="field-label">Title</span>
                <input
                  value={renameTitle}
                  onChange={e => setRenameTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && commitRename()}
                  autoFocus
                />
              </label>
            </div>
            <footer className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setRenameModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!renameTitle.trim()} onClick={commitRename}>Save</button>
            </footer>
          </div>
        </>
      )}

      {deleteConvConfirm && (
        <>
          <div className="modal-scrim" onClick={() => setDeleteConvConfirm(null)} />
          <div className="modal modal-danger" role="dialog">
            <header className="modal-head"><h3>Delete conversation?</h3></header>
            <div className="modal-body">
              <p><b>{deleteConvConfirm.title || 'Untitled chat'}</b> and all its messages will be permanently deleted.</p>
              <p className="quiet">This cannot be undone.</p>
            </div>
            <footer className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setDeleteConvConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={deleteConv}>Delete</button>
            </footer>
          </div>
        </>
      )}

      {clearAllConfirm && (
        <>
          <div className="modal-scrim" onClick={() => setClearAllConfirm(false)} />
          <div className="modal modal-danger" role="dialog">
            <header className="modal-head"><h3>Clear all conversations?</h3></header>
            <div className="modal-body">
              <p>All <b>{conversations.length}</b> conversation{conversations.length !== 1 ? 's' : ''} will be permanently deleted.</p>
              <p className="quiet">This cannot be undone.</p>
            </div>
            <footer className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setClearAllConfirm(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={deleteAll}>Clear all</button>
            </footer>
          </div>
        </>
      )}

      {/* ── chat window ── */}
      <div className="chat-window">
        {/* header */}
        <header className="chat-header">
          <div className="chat-header-left">
            {collectionName ? (
              <span className="chat-coll">
                <Icon d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" w={15} />
                {collectionName}
                {activeId && <span className="locktag">locked</span>}
                {docScope && (
                  <span className="chat-coll-doc" title={`Answers are restricted to ${docScope.docName}`}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                    </svg>
                    <span className="chat-coll-doc-name">{docScope.docName}</span>
                  </span>
                )}
              </span>
            ) : (
              <span className="chat-coll" style={{ color: 'var(--ink-3)' }}>
                <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" w={15} />
                No collection selected
              </span>
            )}
            {isGraph && collectionName && <span className="pill pill-current"><span className="pill-dot" />Knowledge graph on</span>}
          </div>
        </header>

        {/* thread + evidence split */}
        <div className={`chat-body${ev.open ? ' has-ev' : ''}`}>
          <div className="chat-left">
          <div className="thread" ref={threadRef} onScroll={onScroll}>
            {loadingHist && (
              <div className="thread-top"><span className="quiet">Loading earlier turns…</span></div>
            )}
            {hasMore && !loadingHist && (
              <div className="thread-top">
                <button className="link" onClick={loadOlder}>Load earlier turns</button>
              </div>
            )}

            {turns.length === 0 && !streaming && (
              <div className="chat-empty">
                <Mark size={40} />
                {collectionName
                  ? docScope
                    ? <><h2>Ask {docScope.docName} anything.</h2><p>Answers are restricted to this one document and cite the exact page they came from.</p></>
                    : <><h2>Ask {collectionName} anything.</h2><p>Answers cite the exact page they came from{isGraph ? ', and a knowledge graph maps the entities involved' : ''}.</p></>
                  : <><h2>Start a new chat.</h2><p>Pick a collection above, then ask anything.</p></>
                }
              </div>
            )}

            {turns.map((t, i) => {
              const isLast = i === turns.length - 1
              if (t.pending && streaming) {
                return (
                  <div className="turn" key={i}>
                    <div className="msg msg-user"><div className="msg-body">{t.rawQuery}</div></div>
                    <div className="msg msg-ai">
                      <span className="msg-avatar"><Mark /></span>
                      <div className="msg-body">
                        {agentSteps.length > 0
                          ? <AgentProgress steps={agentSteps} />
                          : <div className="agentbar"><div className="agentstep is-active"><span className="agenttick"><span className="agentspin" /></span><span className="agentlabel">Connecting…</span></div></div>
                        }
                      </div>
                    </div>
                  </div>
                )
              }
              return (
                <TurnMessage
                  key={i}
                  turn={t}
                  isLast={isLast}
                  graphUi={graphUi}
                  isGraph={isGraph}
                  onOpenEvidence={openEvidence}
                  activeCite={ev.citation}
                  docMap={docMap}
                />
              )
            })}

            {error && (
              <div style={{ padding: '12px 16px', background: 'var(--ember-soft)', borderRadius: 10, maxWidth: 640, margin: '0 auto' }}>
                <p style={{ margin: 0, font: '400 13px var(--font-sans)', color: 'var(--ember)' }}>{error}</p>
              </div>
            )}
          </div>

          {/* input bar — lives inside chat-left so PDF panel gets full height */}
          <div className="chat-input-wrap">
            <div className="chat-input">
              <textarea
                rows={1}
                value={input}
                disabled={streaming || !collectionName}
                placeholder={
                  !collectionName ? 'Start a new chat to begin asking…'
                  : streaming ? 'Generating answer…'
                  : docScope ? 'Message this document…'
                  : `Message ${collectionName}…`
                }
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
              />
              <div className="chat-input-actions">
                <label
                  className={`graphtoggle ${isGraph ? 'on' : ''} ${activeId ? 'is-disabled' : ''}`}
                  title={activeId ? 'Locked for this conversation' : 'Toggle knowledge graph'}
                >
                  <input type="checkbox" checked={isGraph} disabled={!!activeId} onChange={e => setIsGraph(e.target.checked)} />
                  <Icon d="M5 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM13 5a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM13 19a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM11 12h2M11 12l5-4M11 12l5 4" w={15} />
                  Graph
                </label>
                <button
                  className="btn btn-primary btn-sm send-btn"
                  onClick={send}
                  disabled={streaming || !input.trim() || !collectionName}
                >
                  {streaming
                    ? <span className="agentspin dark" />
                    : <Icon d="M5 12h14M13 6l6 6-6 6" w={16} />
                  }
                </button>
              </div>
            </div>
            <p className="quiet chat-input-foot">
              Enter to send · Shift+Enter for a new line
              {activeId ? ' · collection locked for this chat' : ''}
            </p>
          </div>
          </div>{/* end chat-left */}

          <EvidencePanel
            open={ev.open}
            citation={ev.citation}
            data={ev.data}
            loading={ev.loading}
            error={ev.error}
            errorMsg={ev.errorMsg}
            onClose={closeEvidence}
            docMap={docMap}
            panelWidth={panelWidth}
            onStartResize={startResize}
          />
        </div>

      </div>

      {picker && <CollectionPickerModal onCancel={() => setPicker(false)} onStart={handleStart} />}
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function normalizeTurn(t) {
  return {
    rawQuery:          t.raw_query,
    finalAnswer:       t.final_answer,
    citations:         t.citations || null,
    verificationScore: t.verification_score ?? null,
    iterationsUsed:    t.iterations_used ?? null,
    pending:           false,
  }
}
