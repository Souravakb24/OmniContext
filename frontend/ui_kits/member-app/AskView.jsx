// AskView.jsx — chat surface. Answers cite source pages.
const SEED_REPLY = {
  role: "ai",
  text: "Across the four documents you cited, the pattern is consistent: response time matters more than feature parity. Customers churn when first replies cross 24 hours, regardless of resolution speed.",
  cites: [
    { doc: "Q3 brand brief.docx", page: 14 },
    { doc: "Otter — Acme onboarding call.docx", page: 2 },
    { doc: "RAG survey 2025.pdf", page: 41 },
  ],
};

const AskView = ({ initial }) => {
  const [messages, setMessages] = React.useState(initial);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const listRef = React.useRef();

  React.useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, thinking]);

  const send = () => {
    if (!input.trim()) return;
    const next = [...messages, { role: "user", text: input.trim() }];
    setMessages(next);
    setInput("");
    setThinking(true);
    setTimeout(() => {
      setMessages([...next, SEED_REPLY]);
      setThinking(false);
    }, 1400);
  };

  return (
    <div className="ask">
      <div className="ask-meta">
        <span className="pill pill-current">Asking across <b>all collections</b></span>
        <span className="quiet">4 collections · 131 documents · 9.2k chunks</span>
      </div>

      <div className="ask-list" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.role === "ai" && (
              <span className="msg-avatar">
                <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden>
                  <rect width="64" height="64" rx="14" fill="#0E1B2C" />
                  <path d="M 10 36 C 18 24, 24 44, 32 32 S 46 20, 54 32" fill="none" stroke="#F5F1E8" strokeWidth="2.4" strokeLinecap="round" />
                  <circle cx="32" cy="32" r="3.2" fill="#D9B271" />
                </svg>
              </span>
            )}
            <div className="msg-body">
              <p>{m.text}</p>
              {m.cites && (
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
            <span className="msg-avatar">
              <svg viewBox="0 0 64 64" width="22" height="22" aria-hidden>
                <rect width="64" height="64" rx="14" fill="#0E1B2C" />
                <path d="M 10 36 C 18 24, 24 44, 32 32 S 46 20, 54 32" fill="none" stroke="#F5F1E8" strokeWidth="2.4" strokeLinecap="round" />
                <circle cx="32" cy="32" r="3.2" fill="#D9B271" />
              </svg>
            </span>
            <div className="msg-body">
              <div className="thinking">
                <span /><span /><span />
                <span className="thinking-label quiet">Reading 4 collections…</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <form className="ask-form" onSubmit={e => { e.preventDefault(); send(); }}>
        <div className="ask-input">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything across your library — try “what did Q3 say about churn?”"
          />
          <div className="ask-input-actions">
            <button type="button" className="icon-btn" aria-label="Filter collections">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7h18M6 12h12M10 17h4"/></svg>
            </button>
            <button type="submit" className="btn btn-primary btn-sm">Ask</button>
          </div>
        </div>
        <p className="quiet ask-foot">Answers cite source pages. Press <kbd>Enter</kbd> to send.</p>
      </form>
    </div>
  );
};

window.AskView = AskView;
