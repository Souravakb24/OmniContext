import React, { useState, useRef, useEffect } from 'react'

const SEED_REPLY = {
  role: 'ai',
  text: 'This is a preview — the retrieval pipeline is not wired yet. Once connected, answers will cite the exact page they came from across all your indexed documents.',
  cites: [],
}

const BotAvatar = () => (
  <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden>
    <rect width="64" height="64" rx="14" style={{ fill: 'var(--ink)' }} />
    <path d="M 10 36 C 18 24, 24 44, 32 32 S 46 20, 54 32" fill="none" style={{ stroke: 'var(--paper)' }} strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="32" cy="32" r="3.2" style={{ fill: 'var(--sand)' }} />
  </svg>
)

export default function AskView() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const listRef = useRef()

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, thinking])

  const send = () => {
    if (!input.trim()) return
    const next = [...messages, { role: 'user', text: input.trim() }]
    setMessages(next)
    setInput('')
    setThinking(true)
    setTimeout(() => {
      setMessages([...next, SEED_REPLY])
      setThinking(false)
    }, 1400)
  }

  return (
    <div className="ask">
      <div className="ask-meta">
        <span className="pill pill-current">Asking across <b>all collections</b></span>
        <span className="quiet pill pill-sand">Retrieval preview — mock responses</span>
      </div>

      <div className="ask-list" ref={listRef}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
              <p style={{ font: '400 18px/1.5 var(--font-display)', color: 'var(--ink-3)', margin: 0 }}>
                Ask anything across your library.
              </p>
              <p className="quiet" style={{ marginTop: 8 }}>Answers will cite the source page once retrieval is wired.</p>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.role === 'ai' && <span className="msg-avatar"><BotAvatar /></span>}
            <div className="msg-body">
              <p>{m.text}</p>
              {m.cites && m.cites.length > 0 && (
                <ul className="msg-cites">
                  {m.cites.map((c, j) => (
                    <li key={j}>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                      <span><b>{c.doc}</b> · p. {c.page}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="msg msg-ai">
            <span className="msg-avatar"><BotAvatar /></span>
            <div className="msg-body">
              <div className="thinking">
                <span /><span /><span />
                <span className="thinking-label quiet">Searching your library…</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <form className="ask-form" onSubmit={e => { e.preventDefault(); send() }}>
        <div className="ask-input">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything across your library…"
          />
          <div className="ask-input-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={!input.trim() || thinking}>Ask</button>
          </div>
        </div>
        <p className="quiet ask-foot">Answers cite source pages. Press <kbd>Enter</kbd> to send.</p>
      </form>
    </div>
  )
}
