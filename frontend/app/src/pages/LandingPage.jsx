import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import BLOG_POSTS from '../data/blogPosts'
import './LandingPage.css'
import './BlogPage.css'

// ─── Hero canvas — dark wave with flowing doc icons ───────────────────────────

const DOC_COLORS = ['#5DCAA5', '#4B8FD4', '#D9B271']  // teal=PDF, blue=DOCX, amber=PPT

const DOC_LABELS = ['PDF', 'DOCX', 'PPT']

function HeroCanvas() {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const mouseRef  = useRef(null)          // { x, y } in canvas coords, or null
  const clicksRef = useRef([])            // [{ x, y, t }] — ripple effects

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const cfg = { bg: '#0E1B2C', wave: '#3A4A5C', link: '#5DCAA5', node: '#5DCAA5', accent: '#85D8BB' }

    const NODES = Array.from({ length: 7 }, (_, i) => ({
      offset: i / 7, typeIdx: i % 3, isAccent: i === 4,
    }))

    let dims = { w: 520, h: 270 }
    let startTime = null

    function rr(x, y, w, h, r) {
      ctx.beginPath()
      ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r)
      ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
      ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r)
      ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath()
    }

    function setup() {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.parentElement.clientWidth || 520
      const h = Math.round(w * 0.5)          // ← reduced from 0.72
      canvas.width = w*dpr; canvas.height = h*dpr
      canvas.style.width = w+'px'; canvas.style.height = h+'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dims = { w, h }
    }
    setup()
    const ro = new ResizeObserver(setup)
    ro.observe(canvas.parentElement)

    // mouse tracking
    const toCanvasCoords = e => {
      const r = canvas.getBoundingClientRect()
      return { x: (e.clientX - r.left) * (dims.w / r.width), y: (e.clientY - r.top) * (dims.h / r.height) }
    }
    const onMove  = e => { mouseRef.current = toCanvasCoords(e) }
    const onLeave = () => { mouseRef.current = null; canvas.style.cursor = 'default' }
    const onClick = e => {
      const p = toCanvasCoords(e)
      clicksRef.current.push({ ...p, t: performance.now() })
      // keep only last 4 ripples
      if (clicksRef.current.length > 4) clicksRef.current.shift()
    }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseleave', onLeave)
    canvas.addEventListener('click', onClick)

    function wy(x, t) {
      return dims.h * 0.5 + Math.sin(x * (Math.PI * 2.2 / dims.w) + t * 0.75) * dims.h * 0.18
    }

    function drawDoc(x, y, w, h, color, isAccent, alpha, hovered) {
      ctx.save()
      ctx.globalAlpha = alpha
      const scale = hovered ? 1.35 : 1
      const dw = w * scale, dh = h * scale
      const fold = dw * 0.28

      // glow
      if (isAccent || hovered) {
        const glowColor = hovered ? '#ffffff' : cfg.accent
        const g = ctx.createRadialGradient(x, y, 0, x, y, dw * 2.4)
        g.addColorStop(0, glowColor + (hovered ? '30' : '55'))
        g.addColorStop(1, glowColor + '00')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(x, y, dw * 2.4, 0, Math.PI * 2); ctx.fill()
      }

      // body
      ctx.fillStyle = hovered ? '#ffffff' : (isAccent ? cfg.accent : color)
      ctx.beginPath()
      ctx.moveTo(x - dw/2,  y - dh/2)
      ctx.lineTo(x + dw/2 - fold, y - dh/2)
      ctx.lineTo(x + dw/2,  y - dh/2 + fold)
      ctx.lineTo(x + dw/2,  y + dh/2)
      ctx.lineTo(x - dw/2,  y + dh/2)
      ctx.closePath(); ctx.fill()

      // fold corner
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.beginPath()
      ctx.moveTo(x + dw/2 - fold, y - dh/2)
      ctx.lineTo(x + dw/2 - fold, y - dh/2 + fold)
      ctx.lineTo(x + dw/2,        y - dh/2 + fold)
      ctx.closePath(); ctx.fill()

      // text lines
      ctx.fillStyle = hovered ? 'rgba(14,27,44,0.35)' : 'rgba(255,255,255,0.4)'
      const ly = y - dh/2 + fold + dh * 0.1
      ctx.fillRect(x - dw*0.28, ly,           dw*0.56, dh*0.08)
      ctx.fillRect(x - dw*0.28, ly + dh*0.17, dw*0.38, dh*0.08)

      ctx.restore()
    }

    function draw(t) {
      const { w, h } = dims
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.fillStyle = cfg.bg; rr(0, 0, w, h, 0); ctx.fill(); ctx.clip()

      // wave lines
      ;[0, 0.2, 0.4].forEach((off, i) => {
        ctx.beginPath()
        for (let x = 0; x <= w; x += 2) {
          const y = h*(0.3+i*0.2) + Math.sin(x*(Math.PI*2.2/w) + t*0.75 + off*Math.PI)*h*0.09
          x===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y)
        }
        ctx.strokeStyle = cfg.wave; ctx.lineWidth = 1
        ctx.globalAlpha = 0.22 - i*0.04; ctx.stroke(); ctx.globalAlpha = 1
      })

      // positions
      const pad = w*0.07, span = w+100, cycle = 9
      const dw = w*0.068, dh = dw*1.35
      const mouse = mouseRef.current

      const pos = NODES.map(n => {
        const progress = ((t/cycle + n.offset) % 1)
        const x = -50 + progress*span, y = wy(x, t)
        let alpha = 1
        if (x < pad) alpha = Math.max(0, (x+50)/(pad+50))
        if (x > w-pad) alpha = Math.max(0, (w+50-x)/(pad+50))
        const dist = mouse ? Math.hypot(x - mouse.x, y - mouse.y) : Infinity
        return { x, y, alpha, typeIdx: n.typeIdx, isAccent: n.isAccent, dist }
      }).sort((a, b) => a.x - b.x)

      // find nearest to mouse
      const hoverThreshold = w * 0.13
      let nearestIdx = -1, nearestDist = Infinity
      if (mouse) {
        pos.forEach((p, i) => { if (p.dist < nearestDist) { nearestDist = p.dist; nearestIdx = i } })
        if (nearestDist > hoverThreshold) nearestIdx = -1
      }
      canvas.style.cursor = nearestIdx >= 0 ? 'pointer' : 'default'

      // links
      for (let i = 0; i < pos.length-1; i++) {
        const a = pos[i], b = pos[i+1]
        const d = Math.hypot(b.x-a.x, b.y-a.y), md = w*0.4
        if (d < md) {
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y)
          ctx.strokeStyle = cfg.link; ctx.lineWidth = 1.4
          ctx.globalAlpha = (1-d/md)*0.45*Math.min(a.alpha, b.alpha)
          ctx.stroke(); ctx.globalAlpha = 1
        }
      }

      // docs
      pos.forEach((p, i) => {
        const hovered = i === nearestIdx
        drawDoc(p.x, p.y, dw, dh, DOC_COLORS[p.typeIdx], p.isAccent, p.alpha, hovered)

        // label on hover
        if (hovered) {
          const label = DOC_LABELS[p.typeIdx]
          ctx.save()
          ctx.globalAlpha = p.alpha
          ctx.font = `600 10px sans-serif`
          ctx.textAlign = 'center'
          const lw = ctx.measureText(label).width + 12
          const lh = 16, lx = p.x, ly = p.y - dh * 1.35 - 10
          ctx.fillStyle = 'rgba(255,255,255,0.92)'
          ctx.beginPath()
          ctx.roundRect(lx - lw/2, ly - lh/2, lw, lh, 4)
          ctx.fill()
          ctx.fillStyle = '#0E1B2C'
          ctx.fillText(label, lx, ly + 4)
          ctx.restore()
        }
      })

      // click ripples
      const now = performance.now()
      clicksRef.current = clicksRef.current.filter(c => now - c.t < 1200)
      clicksRef.current.forEach(c => {
        const age = (now - c.t) / 1200
        for (let ring = 0; ring < 3; ring++) {
          const f = Math.max(0, age - ring * 0.22)
          if (f <= 0 || f >= 1) return
          ctx.beginPath()
          ctx.arc(c.x, c.y, w * 0.07 * f * (ring + 1) * 0.6, 0, Math.PI * 2)
          ctx.strokeStyle = cfg.accent
          ctx.lineWidth = 1.5
          ctx.globalAlpha = (1 - f) * 0.6
          ctx.stroke()
          ctx.globalAlpha = 1
        }
      })

      // origin pulse
      const pf = ((t % cycle) / cycle)
      if (pf < 0.12) {
        const f = pf / 0.12
        ctx.beginPath(); ctx.arc(pad*0.5, wy(pad*0.5, t), w*0.04*f, 0, Math.PI*2)
        ctx.strokeStyle = cfg.node; ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.4*(1-f); ctx.stroke(); ctx.globalAlpha = 1
      }

      ctx.restore()
    }

    function loop(ts) {
      if (!startTime) startTime = ts
      draw((ts - startTime) / 1000)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
      canvas.removeEventListener('click', onClick)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
}

// ─── Reusable icons ───────────────────────────────────────────────────────────

const Logo = () => (
  <svg className="mk" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#0E1B2C"/>
    <path d="M 10 36 C 18 24, 24 44, 32 32 S 46 20, 54 32" fill="none" stroke="#F5F1E8" strokeWidth="2.4" strokeLinecap="round"/>
    <circle cx="32" cy="32" r="3.2" fill="#D9B271"/>
  </svg>
)

const LinkedIn = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="#0077B5" aria-label="LinkedIn">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
)

// ─── Landing Knowledge Graph — mirrors GraphCanvas in ChatView ────────────────

const DEMO_TYPE_COLORS = {
  Model: '#2E6F8E', Technique: '#5C7A4F', Concept: '#D9B271',
  Dataset: '#7A5A9E', default: '#5A6878',
}

const DEMO_NODES = [
  { id: 'Transformer',    type: 'Model'     },
  { id: 'Attention',      type: 'Technique' },
  { id: 'RAG',            type: 'Technique' },
  { id: 'Vector DB',      type: 'Concept'   },
  { id: 'Embeddings',     type: 'Concept'   },
  { id: 'LLM',            type: 'Model'     },
  { id: 'Chunking',       type: 'Technique' },
  { id: 'Citations',      type: 'Concept'   },
  { id: 'BERT',           type: 'Model'     },
  { id: 'GPT',            type: 'Model'     },
  { id: 'Fine-tuning',    type: 'Technique' },
  { id: 'Knowledge Graph',type: 'Concept'   },
  { id: 'Parsing',        type: 'Technique' },
  { id: 'Documents',      type: 'Dataset'   },
  { id: 'Retrieval',      type: 'Technique' },
  { id: 'Semantic Search',type: 'Technique' },
]

const DEMO_EDGES = [
  { source: 'Transformer',    target: 'Attention',      relation: 'uses'       },
  { source: 'LLM',            target: 'Transformer',    relation: 'based on'   },
  { source: 'RAG',            target: 'LLM',            relation: 'augments'   },
  { source: 'RAG',            target: 'Vector DB',      relation: 'queries'    },
  { source: 'Vector DB',      target: 'Embeddings',     relation: 'stores'     },
  { source: 'Chunking',       target: 'Embeddings',     relation: 'enables'    },
  { source: 'RAG',            target: 'Citations',      relation: 'produces'   },
  { source: 'LLM',            target: 'Citations',      relation: 'generates'  },
  { source: 'BERT',           target: 'Transformer',    relation: 'based on'   },
  { source: 'GPT',            target: 'Transformer',    relation: 'based on'   },
  { source: 'BERT',           target: 'Embeddings',     relation: 'generates'  },
  { source: 'Fine-tuning',    target: 'LLM',            relation: 'adapts'     },
  { source: 'Knowledge Graph',target: 'RAG',            relation: 'enhances'   },
  { source: 'Knowledge Graph',target: 'Citations',      relation: 'links'      },
  { source: 'Parsing',        target: 'Chunking',       relation: 'precedes'   },
  { source: 'Documents',      target: 'Parsing',        relation: 'input to'   },
  { source: 'Retrieval',      target: 'RAG',            relation: 'core of'    },
  { source: 'Semantic Search',target: 'Vector DB',      relation: 'uses'       },
  { source: 'Semantic Search',target: 'Embeddings',     relation: 'relies on'  },
  { source: 'Documents',      target: 'Chunking',       relation: 'split by'   },
]

function LandingGraph() {
  const wrapRef = useRef(null)
  const dragId  = useRef(null)
  const [dims, setDims] = useState({ w: 560, h: 320 })
  const [base, setBase] = useState({})
  const [hover, setHover] = useState(null)
  const [tick,  setTick]  = useState(0)

  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return
    const w = el.clientWidth || 560, h = 320
    setDims({ w, h })
    // deterministic jitter — stable across renders
    const hash = (s, seed) => {
      let v = seed
      for (let i = 0; i < s.length; i++) v = (Math.imul(v, 31) + s.charCodeAt(i)) | 0
      return Math.abs(v) / 0x7fffffff
    }
    // jittered 4×4 grid — one node per cell, small offset within cell
    const cols = 4, rows = 4, pad = 48
    const cellW = (w - pad * 2) / cols
    const cellH = (h - pad * 2) / rows
    const p = {}
    DEMO_NODES.forEach((nd, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const jx = (hash(nd.id, 3) - 0.5) * cellW * 0.45
      const jy = (hash(nd.id, 9) - 0.5) * cellH * 0.45
      p[nd.id] = {
        x: pad + col * cellW + cellW / 2 + jx,
        y: pad + row * cellH + cellH / 2 + jy,
      }
    })
    setBase(p)
  }, [])

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
    const rc = wrapRef.current.getBoundingClientRect()
    setBase(p => ({ ...p, [dragId.current]: { x: clamp(e.clientX - rc.left, 20, dims.w - 20), y: clamp(e.clientY - rc.top, 20, dims.h - 20) } }))
  }
  const onUp = () => { dragId.current = null }

  const litNode = id => !hover || id === hover || DEMO_EDGES.some(e => (e.source === hover && e.target === id) || (e.target === hover && e.source === id))
  const litEdge = e  => !hover || e.source === hover || e.target === hover
  const types   = [...new Set(DEMO_NODES.map(n => n.type))]

  return (
    <div className="kg" style={{ marginTop: 0, borderTop: 'none', paddingTop: 0 }}>
      <div className="kg-head">
        <span className="kg-title">Knowledge graph</span>
        <span className="quiet">{DEMO_NODES.length} entities · {DEMO_EDGES.length} relations · drag a node</span>
      </div>
      <div className="kg-canvas" ref={wrapRef} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
        <svg className="kg-edges" width={dims.w} height={dims.h}>
          {DEMO_EDGES.map((e, i) => {
            const a = rp(e.source), b = rp(e.target)
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
            const lit = litEdge(e)
            return (
              <g key={i} opacity={lit ? 1 : 0.14}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={hover && lit ? '#2E6F8E' : '#C9C2B2'}
                  strokeWidth={hover && lit ? 1.7 : 1} />
                <rect x={mx - (e.relation.length * 3 + 4)} y={my - 9}
                  width={e.relation.length * 6 + 8} height={13} rx={3}
                  fill="#FAF7F0" opacity={lit ? 0.9 : 0} />
                <text x={mx} y={my + 1} textAnchor="middle"
                  className="kg-edge-label" opacity={lit ? 1 : 0}>{e.relation}</text>
              </g>
            )
          })}
        </svg>
        {DEMO_NODES.map(nd => {
          const p = rp(nd.id)
          const col = DEMO_TYPE_COLORS[nd.type] || DEMO_TYPE_COLORS.default
          const lit = litNode(nd.id)
          return (
            <div key={nd.id}
              className={`kg-node${dragId.current === nd.id ? ' is-drag' : ''}`}
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
        {types.map(t => (
          <span key={t} className="kg-legend-item">
            <span className="dot" style={{ background: DEMO_TYPE_COLORS[t] || DEMO_TYPE_COLORS.default }} />{t}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Animated Q&A Demo ────────────────────────────────────────────────────────

const DEMO_QUERIES = [
  {
    q: 'What did the Q3 report say about churn?',
    chunks: ['q3-report.pdf · p. 14', 'annual-summary.pdf · p. 3'],
    answer: 'Churn fell to **3.4%** in Q3 — the lowest since 2022, driven by the onboarding overhaul launched in July.',
    source: 'q3-report.pdf · p. 14',
  },
  {
    q: 'What are the key bottlenecks in RAG pipelines?',
    chunks: ['rag-research.pdf · p. 7', 'chunking-guide.pdf · p. 2'],
    answer: '**Three core bottlenecks**: parsing quality, chunk boundary selection, and embedding model calibration.',
    source: 'rag-research.pdf · p. 7',
  },
  {
    q: 'Summarize the data storage compliance requirements.',
    chunks: ['compliance-guide.docx · p. 8', 'data-policy.pdf · p. 4'],
    answer: 'Data must be encrypted at rest using **AES-256** and retained for a minimum of **7 years** per regulatory standards.',
    source: 'compliance-guide.docx · p. 8',
  },
]

function renderBold(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part
  )
}

function AnimatedDemo() {
  const [qi, setQi]                   = useState(0)
  const [phase, setPhase]             = useState('typing-q')
  const [typedQ, setTypedQ]           = useState('')
  const [visibleChunks, setVisible]   = useState([])
  const [typedA, setTypedA]           = useState('')
  const [showSource, setShowSource]   = useState(false)
  const [fading, setFading]           = useState(false)
  const timers = useRef([])

  const t = (fn, ms) => timers.current.push(setTimeout(fn, ms))
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  useEffect(() => {
    clear()
    const query = DEMO_QUERIES[qi]

    // reset
    setTypedQ(''); setVisible([]); setTypedA(''); setShowSource(false); setFading(false)
    setPhase('typing-q')

    // 1 — type the question
    let ci = 0
    const typeQ = () => {
      ci++; setTypedQ(query.q.slice(0, ci))
      if (ci < query.q.length) t(typeQ, 38)
      else t(startRetrieve, 350)
    }
    t(typeQ, 100)

    // 2 — show retrieval
    function startRetrieve() {
      setPhase('retrieving')
      t(() => setVisible([0]),    450)
      t(() => setVisible([0, 1]), 950)
      t(startAnswer, 1500)
    }

    // 3 — stream the answer
    function startAnswer() {
      setPhase('typing-a')
      let ai = 0
      const typeA = () => {
        ai++; setTypedA(query.answer.slice(0, ai))
        if (ai < query.answer.length) t(typeA, 22)
        else {
          t(() => setShowSource(true), 320)
          t(() => setFading(true),     3000)
          t(() => setQi(p => (p + 1) % DEMO_QUERIES.length), 3500)
        }
      }
      t(typeA, 22)
    }

    return clear
  }, [qi])

  const query = DEMO_QUERIES[qi]

  return (
    <div className={`demo-panel${fading ? ' demo-fade' : ''}`}>

      {/* question */}
      <div className="demo-q">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flex: 'none', color: 'var(--ink-4)' }}>
          <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
        </svg>
        <span className="demo-q-text">"{typedQ}"</span>
        {phase === 'typing-q' && <span className="demo-cursor" />}
      </div>

      {/* retrieval */}
      {(phase === 'retrieving' || phase === 'typing-a') && (
        <div className="demo-retrieve">
          <span className="demo-retrieve-label">
            {phase === 'retrieving'
              ? <><span className="demo-spinner" /> Searching documents…</>
              : <><span className="demo-tick">✓</span> {query.chunks.length} chunks retrieved</>
            }
          </span>
          <div className="demo-chunks">
            {query.chunks.map((c, i) =>
              visibleChunks.includes(i) && (
                <span key={i} className="demo-chunk-pill">
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>
                  </svg>
                  {c}
                </span>
              )
            )}
          </div>
        </div>
      )}

      {/* answer */}
      {phase === 'typing-a' && typedA && (
        <div className="demo-answer">
          <p className="demo-answer-text">{renderBold(typedA)}</p>
          {showSource && (
            <div className="demo-source">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>
              </svg>
              {query.source}
            </div>
          )}
        </div>
      )}

      {/* progress dots */}
      <div className="demo-progress">
        {DEMO_QUERIES.map((_, i) => (
          <span key={i} className={`demo-dot${i === qi ? ' active' : ''}`} />
        ))}
      </div>

    </div>
  )
}

// ─── FAQ Accordion ────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  { q: 'What file types are supported?',
    a: 'PDF, Word (.docx), and PowerPoint (.ppt, .pptx).' },
  { q: 'How is this different from ChatGPT?',
    a: 'Answers are grounded in your documents only. Every claim links back to a specific source — no information from outside your knowledge base, no hallucination.' },
  { q: 'Is my data private?',
    a: 'Yes. Your documents are fully isolated to your organisation. No other team can access them.' },
  { q: 'Can multiple people use the same knowledge base?',
    a: 'Yes. Collections are shared across your org — upload once, everyone on your team can query.' },
  { q: 'How long does it take to be ready?',
    a: 'Most documents are ready to query in under 2 minutes.' },
  { q: 'What is the knowledge graph feature?',
    a: 'For technical and factual documents, OmniContext maps relationships between concepts and shows them visually — helping you see how ideas connect, not just find text.' },
]

function FaqAccordion() {
  const [openIdx, setOpenIdx] = useState(null)
  return (
    <div className="faq-list">
      {FAQ_ITEMS.map((item, i) => (
        <div key={i} className={`faq-item${openIdx === i ? ' open' : ''}`}>
          <button className="faq-q" onClick={() => setOpenIdx(openIdx === i ? null : i)}>
            <span>{item.q}</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          <div className="faq-body">
            <p className="faq-a">{item.a}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { token } = useAuth()
  const navigate  = useNavigate()
  const hdrRef    = useRef(null)

  useEffect(() => {
    if (token) navigate('/app', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    const hdr = hdrRef.current
    if (!hdr) return
    const onScroll = () => hdr.classList.toggle('scrolled', window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="oc-landing">

      {/* ── HEADER ── */}
      <header className="hdr" ref={hdrRef}>
        <div className="wrap hdr-in">
          <a className="brand" href="#top"><Logo /><b>OmniContext</b></a>
          <nav className="nav">
            <a href="#how">How it works</a>
            <a href="#cases">Use cases</a>
            <a href="#about">About</a>
            <a href="#faq">FAQ</a>
            <Link to="/blog">Blog</Link>
          </nav>
          <div className="hdr-cta">
            <Link className="signin" to="/login">Sign in</Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="hero" id="top">
        <div className="wrap hero-in">
          <div>
            <p className="eyebrow">Document intelligence for teams</p>
            <h1>Every answer shows<br/>exactly <em>where</em> it came from.</h1>
            <p className="hero-sub">Upload your documents, ask questions in plain English, and get cited answers — grounded in your knowledge base, not the internet.</p>
            <div className="hero-cta">
              <Link className="btn btn-primary" to="/login">Get started</Link>
              <Link className="btn btn-ghost" to="/demo">Try the demo</Link>
            </div>
          </div>

          <div className="hero-panel">
            <div className="hero-canvas-wrap">
              <HeroCanvas />
            </div>
            <AnimatedDemo />
          </div>
        </div>
      </section>

      {/* ── WHAT IT DOES ── */}
      <section className="section section-soft" id="what">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">What it does</p>
            <h2 className="section-title">One workspace. From a pile of files to answers.</h2>
          </div>
          <div className="feat-grid">
            <article className="feat">
              <div className="feat-ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>
                </svg>
              </div>
              <h3>Smart uploads</h3>
              <p>Upload PDFs, docs, and reports into one intelligent workspace. We handle the parsing.</p>
            </article>
            <article className="feat">
              <div className="feat-ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h3>Cited answers</h3>
              <p>Ask questions naturally and get accurate answers — each one linked back to the exact source page.</p>
            </article>
            <article className="feat">
              <div className="feat-ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="5" cy="12" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="19" cy="19" r="3"/>
                  <path d="M8 11l8-5M8 13l8 5"/>
                </svg>
              </div>
              <h3>Knowledge graph</h3>
              <p>See how concepts in your documents connect — a visual map of your knowledge base.</p>
            </article>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="section" id="how">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2 className="section-title">From documents to answers in three steps.</h2>
          </div>
          <div className="steps">
            <div className="step">
              <div className="step-badge">01</div>
              <div className="step-ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>
                </svg>
              </div>
              <h3 className="step-title">Upload your documents</h3>
              <p className="step-desc">Add your PDFs, Word files, or presentations into a collection. No formatting, no tagging, no setup required.</p>
            </div>
            <div className="step-arrow">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
            <div className="step">
              <div className="step-badge">02</div>
              <div className="step-ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <h3 className="step-title">We handle the rest</h3>
              <p className="step-desc">OmniContext reads, understands, and organizes everything automatically. Your knowledge base is ready to query in minutes.</p>
            </div>
            <div className="step-arrow">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
            <div className="step">
              <div className="step-badge">03</div>
              <div className="step-ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h3 className="step-title">Ask anything, get real answers</h3>
              <p className="step-desc">Type your question naturally. Get a clear answer with the exact source it came from — so you always know where the information is from.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── KNOWLEDGE GRAPH ── */}
      <section className="section section-soft" id="kg">
        <div className="wrap kg-section">
          <div className="kg-text">
            <p className="eyebrow">Knowledge graph</p>
            <h2 className="section-title">See how knowledge connects.</h2>
            <p className="section-lede">For technical and factual documents, OmniContext maps relationships between concepts visually — helping you see how ideas connect, not just find text.</p>
            <p className="section-lede" style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-3)' }}>Hover over any concept in the graph to explore its connections.</p>
          </div>
          <div className="kg-visual">
            <LandingGraph />
          </div>
        </div>
      </section>

      {/* ── USE CASES ── */}
      <section className="section" id="cases">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Use cases</p>
            <h2 className="section-title">Built for teams that live in documents.</h2>
          </div>
          <div className="cases-grid">
            {[
              {
                icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>,
                label: 'Researchers',
                desc: 'Upload papers and ask cross-document questions. Stop Ctrl+F-ing through PDFs.',
              },
              {
                icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>,
                label: 'Enterprise Teams',
                desc: 'Turn internal wikis, SOPs, and reports into a queryable knowledge base — shared across your team, isolated from everyone else.',
              },
              {
                icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>,
                label: 'Students',
                desc: 'Upload your course material. Ask conceptual questions. Get answers that point to the exact page.',
              },
              {
                icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
                label: 'Legal & Compliance',
                desc: 'Query contracts and regulations with confidence — every answer is tied to a source, nothing is made up.',
              },
            ].map((c, i) => (
              <div key={i} className="case-card">
                <div className="case-ico">{c.icon}</div>
                <h3>{c.label}</h3>
                <p>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ABOUT US ── */}
      <section className="section section-soft" id="about">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">About us</p>
            <h2 className="section-title">Built by people</h2>
          </div>
          <div className="about-grid">

            {/* ── Person card: Sourava ── */}
            <div className="about-card">
              <div className="about-card-top">
                <div className="about-avatar" style={{ background: 'var(--current)' }}>SK</div>
                <a href="https://www.linkedin.com/in/souravakumarbehera/" target="_blank" rel="noopener noreferrer" className="about-li" title="LinkedIn">
                  <LinkedIn />
                </a>
              </div>
              <div>
                <div className="about-name">Sourava Kumar Behera</div>
                <div className="about-role">M.Tech Research · IIT Mandi</div>
              </div>
              <p className="about-bio">Passionate AI Engineer with 2.5+ years building NLP and Generative AI solutions. Focused on LLMs, Agentic RAG systems, OCR pipelines, and production-ready AI products that transform how users interact with data.</p>
              <div className="about-tags">
                {['LLMs', 'Agentic RAG', 'OCR', 'Vector DB', 'NLP'].map(t => (
                  <span key={t} className="about-tag">{t}</span>
                ))}
              </div>
            </div>

            {/* ── Person card: Dhruv ── */}
            <div className="about-card">
              <div className="about-card-top">
                <div className="about-avatar" style={{ background: '#2A3A4F' }}>DB</div>
                <a href="https://www.linkedin.com/in/dhruv-bhatnagar63/" target="_blank" rel="noopener noreferrer" className="about-li" title="LinkedIn">
                  <LinkedIn />
                </a>
              </div>
              <div>
                <div className="about-name">Dhruv Bhatnagar</div>
                <div className="about-role">AI Product Advisor · M.Tech IIT Hyderabad</div>
              </div>
              <p className="about-bio">Bridging cutting-edge AI research and real-world business value with 4+ years across LLMs, NLP, Generative AI, and RAG systems. Specializes in scalable, practical AI product strategy.</p>
              <div className="about-tags">
                {['Generative AI', 'RAG Systems', 'LLMs', 'NLP', 'ML'].map(t => (
                  <span key={t} className="about-tag">{t}</span>
                ))}
              </div>
            </div>

            {/* ── Blog teaser ── */}
            {BLOG_POSTS.length > 0 && (
              <div className="about-blog-teaser">
                <div className="about-blog-teaser-left">
                  <span className="about-blog-teaser-label">Latest from the blog</span>
                  <h3 className="about-blog-teaser-title">{BLOG_POSTS[0].title}</h3>
                  <p className="about-blog-teaser-sub">{BLOG_POSTS[0].subtitle}</p>
                </div>
                <div className="about-blog-teaser-right">
                  <a href={BLOG_POSTS[0].externalUrl} target="_blank" rel="noopener noreferrer"
                    className="about-blog-teaser-link">
                    Read on Medium
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7 17L17 7M7 7h10v10"/>
                    </svg>
                  </a>
                  <Link to="/blog" className="about-blog-all">
                    All posts
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </Link>
                </div>
              </div>
            )}

          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="section" id="faq">
        <div className="wrap faq-wrap">
          <div>
            <p className="eyebrow">FAQ</p>
            <h2 className="section-title">Common questions.</h2>
            <p className="section-lede">Everything you need to know before getting started.</p>
          </div>
          <FaqAccordion />
        </div>
      </section>

      {/* ── CTA BAND ── */}
      <section className="section" id="start">
        <div className="wrap">
          <div className="cta-band">
            <svg className="bg" viewBox="0 0 1100 300" preserveAspectRatio="none" aria-hidden="true">
              <path d="M -20 150 C 160 90, 360 220, 540 150 S 900 80, 1120 130" fill="none" stroke="#2E6F8E" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
              <path d="M -20 200 C 200 140, 420 260, 600 200 S 920 130, 1120 180" fill="none" stroke="#D9B271" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
            </svg>
            <h2>Ask your documents <em>anything.</em></h2>
            <p>Start free. Bring your first ten documents and see the difference.</p>
            <div className="cta-row">
              <Link className="btn btn-primary" to="/login">Get started</Link>
              <a className="btn btn-ghost" href="#how">See how it works</a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="ftr">
        <div className="wrap">
          <div className="ftr-in">
            <div className="ftr-brand">
              <div className="ftr-brand-row"><Logo /><b>OmniContext</b></div>
              <p className="ftr-line">Smarter document intelligence for modern teams.</p>
            </div>
            <div className="ftr-cols">
              <div>
                <p className="ov">Product</p>
                <a href="#what">What it does</a>
                <a href="#how">How it works</a>
                <a href="#cases">Use cases</a>
              </div>
              <div>
                <p className="ov">Company</p>
                <a href="#about">About us</a>
                <Link to="/blog">Blog</Link>
                <a href="#faq">FAQ</a>
              </div>
              <div>
                <p className="ov">Start</p>
                <Link to="/login">Get started</Link>
                <Link to="/login">Sign in</Link>
              </div>
            </div>
          </div>
          <div className="ftr-base">
            <span>© 2026 OmniContext</span>
            <span>Made on paper.</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
