import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { answerRemarkPlugins, answerRehypePlugins, normalizeMath } from '../markdown.js'
import './DemoPage.css'

// ── LocalStorage ──────────────────────────────────────────────────────────────

const LS_KEY = 'oc_demo_session'

function loadSession() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null') }
  catch { return null }
}
function saveSession(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)) }
function clearSession()  { localStorage.removeItem(LS_KEY) }

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMs(val) {
  if (!val) return null
  if (typeof val === 'string') return new Date(val).getTime()
  return val < 1e12 ? val * 1000 : val
}

function fmtTime(totalSecs) {
  if (totalSecs <= 0) return '0:00'
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = Math.floor(totalSecs % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function ext(filename) {
  return filename.split('.').pop().toUpperCase()
}

function resolveDocName(doc_id, docMap, headings) {
  if (docMap[doc_id]) return docMap[doc_id]
  if (headings) {
    const base = headings.split(/[:–—]/)[0].trim()
    if (base.length > 2) return base.length > 48 ? base.slice(0, 48) + '…' : base
  }
  return doc_id ? doc_id.slice(0, 8) + '…' : '—'
}

// ── Sub-components ────────────────────────────────────────────────────────────

const Logo = () => (
  <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#F5F1E8"/>
    <path d="M 10 36 C 18 24, 24 44, 32 32 S 46 20, 54 32" fill="none" stroke="#0E1B2C" strokeWidth="2.4" strokeLinecap="round"/>
    <circle cx="32" cy="32" r="3.2" fill="#D9B271"/>
  </svg>
)

const Icon = ({ d, w = 16 }) => (
  <svg viewBox="0 0 24 24" width={w} height={w} fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d={d} />
  </svg>
)

function DocIcon({ filename }) {
  const e = ext(filename)
  const color = e === 'PDF' ? '#E8504A' : e === 'DOCX' ? '#2B7CD3' : '#D9560B'
  return (
    <div className="demo-doc-icon" style={{ background: color + '18', color }}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6"/>
      </svg>
      <span>{e}</span>
    </div>
  )
}

const TERMINAL = new Set(['COMPLETED', 'FAILED'])

function StatusBadge({ status, errorMsg }) {
  if (status === 'COMPLETED')
    return <span className="demo-badge demo-badge-done"><span className="demo-tick">✓</span>Ready</span>
  if (status === 'FAILED')
    return <span className="demo-badge demo-badge-fail"><span>✗</span>{errorMsg || 'Failed'}</span>
  const label = status === 'UPLOADING' ? 'Uploading' : status.charAt(0) + status.slice(1).toLowerCase()
  return <span className="demo-badge demo-badge-prog"><span className="demo-spin"/>{label}…</span>
}

// ── CitationList ──────────────────────────────────────────────────────────────

const CitationList = ({ citations, onOpen, activeProof, docMap = {} }) => {
  const [open, setOpen] = useState(true)
  if (!citations || !citations.length) return null
  return (
    <div className="cites">
      <button className="cites-toggle" onClick={() => setOpen(o => !o)}>
        <Icon d={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} w={14} />
        Sources ({citations.length})
      </button>
      {open && (
        <div className="cites-chips">
          {citations.map((c, i) => {
            const name   = resolveDocName(c.document_name, docMap, c.headings)
            const active = activeProof && activeProof.document_name === c.document_name
            return (
              <button key={i} className={`cite-chip ${active ? 'active' : ''}`} onClick={() => onOpen(c)}>
                <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden>
                  <path d="M8 4h12l6 6v18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="#C24A3A" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M20 4v6h6" fill="none" stroke="#C24A3A" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                <span className="cite-chip-name">{name}</span>
                <span className="cite-chip-page">p. {c.page_numbers}</span>
                <Icon d="M9 6l6 6-6 6" w={13} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ProofPanel ────────────────────────────────────────────────────────────────

const ProofPanel = ({ cite, onClose, docMap = {} }) => {
  if (!cite) return null
  const filename = resolveDocName(cite.document_name, docMap, cite.headings)
  const section  = cite.headings || cite.section || null
  const page     = cite.page_numbers ? String(cite.page_numbers).split(',')[0].trim() : '—'
  const excerpt  = cite.relevance || cite.quote || null
  const docLabel = (filename || '').replace(/\.[^.]+$/, '').toUpperCase()

  return (
    <aside className="proof demo-proof">
      <header className="proof-head">
        <div className="proof-doc">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden>
            <path d="M8 4h12l6 6v18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="#C24A3A" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M20 4v6h6" fill="none" stroke="#C24A3A" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
          <div>
            <b title={filename}>{filename}</b>
            <span className="quiet">Page {page}{section ? ` · ${section}` : ''}</span>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close source">
          <Icon d="M6 6l12 12M18 6 6 18" />
        </button>
      </header>

      <div className="proof-body">
        <div className="proof-page">
          <div className="proof-pagehead">{docLabel} · PAGE {page}</div>

          {section && (
            <div className="proof-section">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 6h16M4 12h10M4 18h14"/>
              </svg>
              {section}
            </div>
          )}

          {excerpt ? (
            <blockquote className="proof-quote">"{excerpt}"</blockquote>
          ) : (
            <p className="proof-quote" style={{ color: 'var(--ink-3)', fontStyle: 'normal' }}>
              Chunk {cite.chunk_index} · this passage supports the answer above.
            </p>
          )}
        </div>
      </div>

      <footer className="proof-foot">
        <span className="pill pill-current"><span className="pill-dot" />Page {page}</span>
        {cite.chunk_index != null && <span className="quiet">Chunk {cite.chunk_index}</span>}
      </footer>
    </aside>
  )
}

// ── Knowledge Graph ───────────────────────────────────────────────────────────

const TYPE_COLORS = {
  Model: '#2E6F8E', Technique: '#5C7A4F', Concept: '#D9B271',
  Organisation: '#C24A3A', Person: '#7A5A9E', default: '#5A6878',
}

const InteractiveGraph = ({ graph }) => {
  const nodes = graph?.nodes || []
  const edges = graph?.edges || []
  if (!nodes.length) {
    return (
      <div className="kg">
        <div className="kg-head"><span className="kg-title">Knowledge graph</span></div>
        <div className="kg-empty">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="5" cy="12" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="19" cy="19" r="3"/>
            <path d="M8 11l8-5M8 13l8 5"/>
          </svg>
          <span>No entities found in the graph for this query.</span>
        </div>
      </div>
    )
  }
  return <GraphCanvas nodes={nodes} edges={edges} />
}

const GraphCanvas = ({ nodes, edges }) => {
  const wrapRef  = useRef(null)
  const dragId   = useRef(null)
  const [dims,  setDims]  = useState({ w: 560, h: 320 })
  const [base,  setBase]  = useState({})
  const [hover, setHover] = useState(null)
  const [tick,  setTick]  = useState(0)

  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return
    const w = el.clientWidth || 560, h = 320
    setDims({ w, h })
    const n = nodes.length, r = Math.min(w, h) / 2 - 58, cx = w / 2, cy = h / 2
    const p = {}
    nodes.forEach((nd, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2
      p[nd.id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
    })
    setBase(p)
  }, [nodes])

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
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hover && lit ? '#2E6F8E' : '#C9C2B2'} strokeWidth={hover && lit ? 1.7 : 1} />
                <rect x={mx - (e.relation.length * 3 + 4)} y={my - 9} width={e.relation.length * 6 + 8} height={13} rx={3} fill="#FAF7F0" opacity={lit ? 0.9 : 0} />
                <text x={mx} y={my + 1} textAnchor="middle" className="kg-edge-label" opacity={lit ? 1 : 0}>{e.relation}</text>
              </g>
            )
          })}
        </svg>
        {nodes.map(nd => {
          const p   = rp(nd.id)
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

// ── Main component ────────────────────────────────────────────────────────────

const MAX_DOCS     = 2
const MAX_QUERIES  = 3
const END_SECS     = 300

export default function DemoPage() {
  const navigate = useNavigate()

  // Session
  const [sessionId,      setSessionId]      = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [expiresAtMs,    setExpiresAtMs]    = useState(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [sessionSecs,    setSessionSecs]    = useState(null)

  // Upload / docs
  const [docs,      setDocs]      = useState([])
  const [uploading, setUploading] = useState(false)
  const [dragOver,  setDragOver]  = useState(false)

  // Chat
  const [messages,    setMessages]    = useState([])
  const [queryCount,  setQueryCount]  = useState(0)
  const [inputValue,  setInputValue]  = useState('')
  const [isSending,   setIsSending]   = useState(false)
  const [activeProof, setActiveProof] = useState(null)

  // End-of-demo
  const [showEndBanner, setShowEndBanner] = useState(false)
  const [endSecs,       setEndSecs]       = useState(END_SECS)

  // Refs
  const pollIntervals   = useRef({})
  const endTimerRef     = useRef(null)
  const sessionTimerRef = useRef(null)
  const sseAbortRef     = useRef(null)
  const mountedRef      = useRef(true)
  const fileInputRef    = useRef(null)
  const messagesEndRef  = useRef(null)

  // Derived
  const chatVisible    = docs.some(d => d.status === 'COMPLETED')
  const uploadDisabled = sessionLoading || docs.length >= MAX_DOCS || uploading
  const queryDisabled  = !chatVisible || isSending || queryCount >= MAX_QUERIES
  const docMap         = Object.fromEntries(docs.map(d => [d.doc_id, d.filename]))

  // ── Cleanup on unmount ──
  useEffect(() => () => {
    mountedRef.current = false
    Object.values(pollIntervals.current).forEach(clearInterval)
    clearInterval(endTimerRef.current)
    clearInterval(sessionTimerRef.current)
    sseAbortRef.current?.abort()
  }, [])

  // ── Handle 410/404 anywhere ──
  const handle410 = useCallback(() => {
    clearSession()
    Object.values(pollIntervals.current).forEach(clearInterval)
    pollIntervals.current = {}
    if (mountedRef.current) setSessionExpired(true)
  }, [])

  // ── Update docs + sync to localStorage ──
  const updateDoc = useCallback((doc_id, patch) => {
    setDocs(prev => {
      const next = prev.map(d => d.doc_id === doc_id ? { ...d, ...patch } : d)
      const sess = loadSession()
      if (sess) {
        sess.docs = next.map(({ doc_id, filename, status }) => ({ doc_id, filename, status }))
        saveSession(sess)
      }
      return next
    })
  }, [])

  // ── Poll a single doc status ──
  const startPolling = useCallback((doc_id, sid) => {
    if (pollIntervals.current[doc_id]) return
    const tick = async () => {
      try {
        const r = await fetch(`/demo/document/${doc_id}/status?session_id=${sid}`)
        if (r.status === 410 || r.status === 404) { handle410(); return }
        if (!r.ok || !mountedRef.current) return
        const data = await r.json()
        updateDoc(doc_id, { status: data.status, errorMsg: data.error_message || null })
        if (TERMINAL.has(data.status)) {
          clearInterval(pollIntervals.current[doc_id])
          delete pollIntervals.current[doc_id]
        }
      } catch {}
    }
    tick()
    pollIntervals.current[doc_id] = setInterval(tick, 4000)
  }, [handle410, updateDoc])

  // ── Bootstrap session on mount ──
  useEffect(() => {
    const stored = loadSession()
    if (stored?.session_id) {
      const msVal = toMs(stored.expires_at)
      setSessionId(stored.session_id)
      setExpiresAtMs(msVal)
      setSessionLoading(false)
      const restoredDocs = (stored.docs || []).map(d => ({
        doc_id: d.doc_id, filename: d.filename, status: d.status,
        pagesTruncated: false, originalPages: null, errorMsg: null,
      }))
      setDocs(restoredDocs)
      restoredDocs.forEach(d => {
        if (!TERMINAL.has(d.status)) startPolling(d.doc_id, stored.session_id)
      })
    } else {
      fetch('/demo/start', { method: 'POST' })
        .then(r => { if (!r.ok) throw r; return r.json() })
        .then(data => {
          if (!mountedRef.current) return
          const msVal = toMs(data.expires_at)
          const sess  = { session_id: data.session_id, expires_at: msVal, docs: [] }
          saveSession(sess)
          setSessionId(data.session_id)
          setExpiresAtMs(msVal)
          setSessionLoading(false)
        })
        .catch(() => { if (mountedRef.current) setSessionLoading(false) })
    }
  }, [startPolling])

  // ── Brand bar session timer ──
  useEffect(() => {
    if (!expiresAtMs) return
    const tick = () => {
      if (!mountedRef.current) return
      setSessionSecs(Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)))
    }
    tick()
    sessionTimerRef.current = setInterval(tick, 1000)
    return () => clearInterval(sessionTimerRef.current)
  }, [expiresAtMs])

  // ── End-of-demo 5-min countdown ──
  useEffect(() => {
    if (!showEndBanner) return
    let secs = END_SECS
    setEndSecs(secs)
    endTimerRef.current = setInterval(() => {
      secs -= 1
      if (!mountedRef.current) return
      if (secs <= 0) {
        clearInterval(endTimerRef.current)
        fetch(`/demo/session/${sessionId}`, { method: 'DELETE', keepalive: true }).catch(() => {})
        clearSession()
        navigate('/')
        return
      }
      setEndSecs(secs)
    }, 1000)
    return () => clearInterval(endTimerRef.current)
  }, [showEndBanner, sessionId, navigate])

  // ── Auto-scroll chat ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── End demo manually ──
  const handleEndDemo = useCallback(() => {
    Object.values(pollIntervals.current).forEach(clearInterval)
    pollIntervals.current = {}
    clearInterval(endTimerRef.current)
    clearInterval(sessionTimerRef.current)
    sseAbortRef.current?.abort()
    if (sessionId) {
      fetch(`/demo/session/${sessionId}`, { method: 'DELETE', keepalive: true }).catch(() => {})
    }
    clearSession()
    navigate('/')
  }, [sessionId, navigate])

  // ── Upload handler ──
  const handleFiles = async (files) => {
    const allowed = Array.from(files)
      .filter(f => /\.(pdf|docx|ppt|pptx)$/i.test(f.name))
      .slice(0, MAX_DOCS - docs.length)
    if (!allowed.length || !sessionId) return
    setUploading(true)

    for (const file of allowed) {
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
      setDocs(prev => [...prev, {
        doc_id: tempId, filename: file.name, status: 'UPLOADING',
        pagesTruncated: false, originalPages: null, errorMsg: null,
      }])

      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('session_id', sessionId)
        const r = await fetch('/demo/upload', { method: 'POST', body: fd })

        if (r.status === 410 || r.status === 404) { handle410(); break }
        if (r.status === 429) {
          setDocs(prev => prev.filter(d => d.doc_id !== tempId))
          break
        }
        if (!r.ok) {
          setDocs(prev => prev.map(d => d.doc_id === tempId
            ? { ...d, status: 'FAILED', errorMsg: 'Upload failed.' } : d))
          continue
        }

        const data = await r.json()
        const realDoc = {
          doc_id: data.doc_id,
          filename: file.name,
          status: data.status || 'QUEUED',
          pagesTruncated: data.pages_truncated || false,
          originalPages:  data.original_pages  || null,
          errorMsg: null,
        }
        setDocs(prev => {
          const next = prev.map(d => d.doc_id === tempId ? realDoc : d)
          const sess = loadSession()
          if (sess) {
            sess.docs = next.map(({ doc_id, filename, status }) => ({ doc_id, filename, status }))
            saveSession(sess)
          }
          return next
        })
        startPolling(data.doc_id, sessionId)
      } catch {
        setDocs(prev => prev.map(d => d.doc_id === tempId
          ? { ...d, status: 'FAILED', errorMsg: 'Upload failed.' } : d))
      }
    }
    setUploading(false)
  }

  // ── Send query (SSE) ──
  const sendQuery = async () => {
    if (queryDisabled || !inputValue.trim()) return
    const q = inputValue.trim()
    setInputValue('')
    const msgId = `m${Date.now()}`
    setMessages(prev => [
      ...prev,
      { id: `${msgId}-u`, role: 'user',      content: q },
      { id: `${msgId}-a`, role: 'assistant', content: '', agentStep: '', streaming: true, error: null, citations: null, graphUi: null },
    ])
    setQueryCount(c => c + 1)
    setIsSending(true)

    const ctrl = new AbortController()
    sseAbortRef.current = ctrl
    let capturedAnswer = ''

    try {
      const resp = await fetch('/demo/query', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session_id: sessionId, raw_query: q, is_graph: true }),
        signal:  ctrl.signal,
      })

      if (resp.status === 410 || resp.status === 404) { handle410(); return }
      if (!resp.ok) {
        const code = resp.status
        setMessages(prev => prev.map(m => m.id === `${msgId}-a`
          ? { ...m, streaming: false, error: code === 429 ? 'Query limit reached.' : 'Something went wrong.' }
          : m))
        setIsSending(false)
        return
      }

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop()

        for (const part of parts) {
          if (!part.trim()) continue

          let sseType = '', ev = null
          for (const line of part.split('\n')) {
            if (line.startsWith('event: '))      sseType = line.slice(7).trim()
            else if (line.startsWith('data: ')) {
              try { ev = JSON.parse(line.slice(6)) } catch {}
            }
          }
          if (!ev) continue

          const evType = sseType || ev.event || ''

          if (evType === 'values') {
            if (ev.final_answer) capturedAnswer = ev.final_answer
            if (!capturedAnswer && Array.isArray(ev.messages)) {
              const last = ev.messages.at(-1)
              if (last?.content) capturedAnswer = last.content
            }
          } else if (evType === 'stream_end') {
            if (!capturedAnswer) capturedAnswer = ev.final_answer || ev.answer || ''
            const citations = ev.citations || []
            const graphUi   = ev.graph_ui  || null
            setMessages(prev => prev.map(m => m.id === `${msgId}-a`
              ? { ...m, content: capturedAnswer, agentStep: '', streaming: false, citations, graphUi }
              : m))
            if (ev.is_final) setShowEndBanner(true)
          } else if (evType === 'start' || evType === 'progress' || evType === 'done') {
            if (evType === 'done' && ev.agent === 'answer_agent' && ev.answer) {
              capturedAnswer = ev.answer
            }
            setMessages(prev => prev.map(m => m.id === `${msgId}-a`
              ? { ...m, agentStep: ev.agent || '' } : m))
          } else if (evType === 'error') {
            setMessages(prev => prev.map(m => m.id === `${msgId}-a`
              ? { ...m, streaming: false, error: ev.detail || ev.error || 'Pipeline error.' } : m))
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m => m.id === `${msgId}-a`
          ? { ...m, streaming: false, error: 'Connection error.' } : m))
      }
    } finally {
      if (mountedRef.current) setIsSending(false)
    }
  }

  // ── Restart demo ──
  const restartDemo = () => {
    clearSession()
    setSessionExpired(false)
    setSessionLoading(true)
    setDocs([]); setMessages([]); setQueryCount(0); setShowEndBanner(false); setActiveProof(null)
    fetch('/demo/start', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (!mountedRef.current) return
        const msVal = toMs(data.expires_at)
        saveSession({ session_id: data.session_id, expires_at: msVal, docs: [] })
        setSessionId(data.session_id)
        setExpiresAtMs(msVal)
        setSessionLoading(false)
      }).catch(() => { if (mountedRef.current) setSessionLoading(false) })
  }

  // ── RENDER: session expired ──
  if (sessionExpired) {
    return (
      <div className="demo-page">
        <header className="demo-bar">
          <Link to="/" className="demo-bar-brand"><Logo /><b>OmniContext</b><span className="demo-bar-label">· Try it</span></Link>
          <div />
          <Link to="/login" className="demo-bar-cta">Sign up free →</Link>
        </header>
        <main className="demo-main">
          <div className="demo-expired-card">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
            <h2>Demo session expired</h2>
            <p>Sessions last 2 hours. Start a fresh one to try OmniContext again.</p>
            <button className="demo-restart-btn" onClick={restartDemo}>Start a new demo</button>
            <Link to="/" className="demo-home-link">← Back to home</Link>
          </div>
        </main>
      </div>
    )
  }

  // ── RENDER: main page ──
  return (
    <div className="demo-page">

      {/* ── Brand bar ── */}
      <header className="demo-bar">
        <Link to="/" className="demo-bar-brand">
          <Logo />
          <b>OmniContext</b>
          <span className="demo-bar-label">· Try it</span>
        </Link>
        <div className="demo-bar-mid">
          {sessionSecs !== null && sessionSecs > 0 && (
            <span className="demo-bar-timer">Session: {fmtTime(sessionSecs)} remaining</span>
          )}
        </div>
        <div className="demo-bar-right">
          {sessionId && !sessionExpired && (
            <button className="demo-bar-end" onClick={handleEndDemo}>End demo</button>
          )}
          <Link to="/login" className="demo-bar-cta">Sign up free →</Link>
        </div>
      </header>

      {/* ── Centered card ── */}
      <main className="demo-main">
        <div className="demo-card">

          {/* Card intro */}
          <div className="demo-card-head">
            <h1 className="demo-card-title">See it for yourself.</h1>
            <p className="demo-card-sub">Upload up to 2 documents and ask questions. Every answer links back to the exact source.</p>
            <p className="demo-card-note">Max 2 pages per document are ingested in demo mode.</p>
          </div>

          {/* ── Upload + doc cards ── */}
          <section className="demo-upload-section">

            {/* Drop zone */}
            <div
              className={[
                'demo-drop',
                dragOver       ? 'drag-over' : '',
                uploadDisabled ? 'disabled'  : '',
              ].filter(Boolean).join(' ')}
              onClick={() => !uploadDisabled && fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); if (!uploadDisabled) setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (!uploadDisabled) handleFiles(e.dataTransfer.files) }}
              role="button"
              tabIndex={uploadDisabled ? -1 : 0}
              onKeyDown={e => e.key === 'Enter' && !uploadDisabled && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.ppt,.pptx"
                multiple
                style={{ display: 'none' }}
                onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
              />
              {sessionLoading ? (
                <>
                  <div className="demo-drop-ico"><span className="demo-spin" style={{ width: 18, height: 18, borderWidth: 2 }}/></div>
                  <span className="demo-drop-main" style={{ color: 'var(--ink-4)' }}>Starting session…</span>
                </>
              ) : uploadDisabled && docs.length >= MAX_DOCS ? (
                <>
                  <div className="demo-drop-ico demo-drop-ico-done">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                  </div>
                  <span className="demo-drop-main">Max 2 documents reached</span>
                </>
              ) : (
                <>
                  <div className="demo-drop-ico">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>
                    </svg>
                  </div>
                  <span className="demo-drop-main">
                    Drop PDF, DOCX or PPT here — or <b>click to browse</b>
                  </span>
                  <span className="demo-drop-sub">
                    {docs.length === 0 ? 'Up to 2 documents' : `${MAX_DOCS - docs.length} more document${MAX_DOCS - docs.length > 1 ? 's' : ''} allowed`}
                  </span>
                </>
              )}
            </div>

            {/* Doc cards */}
            {docs.map(doc => (
              <div key={doc.doc_id} className="demo-doc-card">
                <DocIcon filename={doc.filename} />
                <div className="demo-doc-info">
                  <span className="demo-doc-name">{doc.filename}</span>
                  {doc.pagesTruncated && (
                    <span className="demo-doc-trunc">
                      Only the first 2 of {doc.originalPages} pages were ingested for this demo.
                    </span>
                  )}
                </div>
                <StatusBadge status={doc.status} errorMsg={doc.errorMsg} />
              </div>
            ))}
          </section>

          {/* Divider */}
          {docs.length > 0 && (
            <div className="demo-divider"><span>Ask</span></div>
          )}

          {/* ── Chat ── */}
          {chatVisible ? (
            <section className="demo-chat-section">

              {/* Query counter */}
              <div className="demo-query-bar">
                <div className="demo-query-pips">
                  {Array.from({ length: MAX_QUERIES }, (_, i) => (
                    <span key={i} className={`demo-pip${i < queryCount ? ' used' : ''}`} />
                  ))}
                  <span className="demo-query-label">
                    {queryCount < MAX_QUERIES
                      ? `${MAX_QUERIES - queryCount} quer${MAX_QUERIES - queryCount === 1 ? 'y' : 'ies'} left`
                      : 'Limit reached'}
                  </span>
                </div>
                {queryCount >= MAX_QUERIES && (
                  <Link to="/login" className="demo-upgrade-link">Sign up for unlimited →</Link>
                )}
              </div>

              {/* Messages */}
              <div className="demo-messages">
                {messages.length === 0 && (
                  <div className="demo-chat-empty">
                    Your documents are ready — ask anything about them.
                  </div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className={`demo-msg demo-msg-${msg.role}`}>
                    {msg.role === 'user' ? (
                      <div className="demo-bubble demo-bubble-user">{msg.content}</div>
                    ) : (
                      <div className="demo-bubble demo-bubble-assistant">
                        {msg.streaming && (
                          <span className="demo-thinking">
                            <span className="demo-spin"/>
                            {msg.agentStep ? `${msg.agentStep}…` : 'Thinking…'}
                          </span>
                        )}
                        {!msg.streaming && msg.error && (
                          <span className="demo-msg-error">{msg.error}</span>
                        )}
                        {!msg.streaming && !msg.error && (
                          <>
                            <div className="md-answer">
                              <ReactMarkdown remarkPlugins={answerRemarkPlugins} rehypePlugins={answerRehypePlugins}>{normalizeMath(msg.content)}</ReactMarkdown>
                            </div>
                            <CitationList
                              citations={msg.citations}
                              onOpen={setActiveProof}
                              activeProof={activeProof}
                              docMap={docMap}
                            />
                            {msg.graphUi && <InteractiveGraph graph={msg.graphUi} />}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="demo-input-row">
                <input
                  className="demo-input"
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendQuery()}
                  placeholder={
                    queryCount >= MAX_QUERIES
                      ? 'Query limit reached'
                      : 'Ask something about your documents…'
                  }
                  disabled={queryDisabled}
                />
                <button
                  className="demo-send-btn"
                  onClick={sendQuery}
                  disabled={queryDisabled || !inputValue.trim()}
                  aria-label="Send"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            </section>

          ) : docs.length > 0 ? (
            <div className="demo-chat-pending">
              <span className="demo-spin"/>
              Chat will appear once your document is ready…
            </div>
          ) : null}

        </div>
      </main>

      {/* ── Proof panel (fixed overlay) ── */}
      {activeProof && (
        <ProofPanel
          cite={activeProof}
          onClose={() => setActiveProof(null)}
          docMap={docMap}
        />
      )}

      {/* ── End-of-demo sticky banner ── */}
      {showEndBanner && (
        <div className="demo-end-banner" role="alert">
          <div className="demo-end-inner">
            <div className="demo-end-left">
              <span className="demo-end-timer">{fmtTime(endSecs)}</span>
              <span className="demo-end-text">remaining in your demo session</span>
            </div>
            <div className="demo-end-right">
              <Link
                to="/login"
                className="demo-end-cta"
                onClick={() => clearInterval(endTimerRef.current)}
              >
                Sign up to keep going →
              </Link>
              <button
                className="demo-end-dismiss"
                onClick={() => setShowEndBanner(false)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
