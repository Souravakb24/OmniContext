// Library.jsx — landing view. Collections grid + recent documents.
const FileIcon = ({ ext }) => {
  const color = ext === "pdf" ? "#C24A3A" : ext === "docx" ? "#2E6F8E" : "#D9B271";
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden>
      <path d="M8 4 h12 l6 6 v18 a2 2 0 0 1 -2 2 H8 a2 2 0 0 1 -2 -2 V6 a2 2 0 0 1 2 -2 z" fill="none" stroke="#0E1B2C" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M20 4 v6 h6" fill="none" stroke="#2E6F8E" strokeWidth="1.5" strokeLinejoin="round"/>
      <text x="16" y="24" textAnchor="middle" fontFamily="Geist, sans-serif" fontSize="6.5" fontWeight="600" fill={color}>{ext.toUpperCase().slice(0,3)}</text>
    </svg>
  );
};

const StatusPill = ({ status, progress }) => {
  const map = {
    "Ready":      { c: "moss",    dot: true },
    "Embedding":  { c: "current", dot: true, pulse: true },
    "Indexing":   { c: "current", dot: true, pulse: true },
    "Converting": { c: "current", dot: true, pulse: true },
    "Parsing":    { c: "current", dot: true, pulse: true },
    "Chunking":   { c: "current", dot: true, pulse: true },
    "Uploaded":   { c: "neutral", dot: true },
    "Failed":     { c: "ember",   dot: true },
  };
  const m = map[status] || map["Uploaded"];
  return (
    <span className={`pill pill-${m.c}`}>
      <span className={`pill-dot ${m.pulse ? "pulse" : ""}`} />
      {status}{progress != null && ` · ${progress} %`}
    </span>
  );
};

const Library = ({ data, onUpload, onAsk }) => (
  <div className="lib">
    <section className="lib-section">
      <div className="lib-section-head">
        <h2>Collections</h2>
        <a href="#" className="link-quiet">View all →</a>
      </div>
      <div className="lib-collections">
        {data.collections.map(c => (
          <article key={c.id} className="col-card" onClick={onAsk}>
            <div className="col-card-head">
              <h3>{c.name}</h3>
              <span className="pill pill-neutral">{c.doc_count} docs</span>
            </div>
            <p className="col-card-desc">{c.description}</p>
            <div className="col-card-foot">
              <span className="quiet">Updated {c.updated}</span>
              <span className="link-quiet">Ask →</span>
            </div>
          </article>
        ))}
        <button className="col-card col-card-add" onClick={onUpload}>
          <div className="col-card-add-inner">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>
            <span>New collection</span>
          </div>
        </button>
      </div>
    </section>

    <section className="lib-section">
      <div className="lib-section-head">
        <h2>Recent documents</h2>
        <span className="quiet">3 uploads remaining today</span>
      </div>
      <div className="doc-table">
        <div className="doc-row doc-head">
          <span>Document</span>
          <span>Collection</span>
          <span>Status</span>
          <span>Uploaded</span>
          <span></span>
        </div>
        {data.documents.map(d => (
          <div key={d.id} className={`doc-row ${d.status === "Failed" ? "is-failed" : ""}`}>
            <span className="doc-file">
              <FileIcon ext={d.ext} />
              <span>
                <b>{d.filename}</b>
                <span className="quiet">{d.size} · {d.pages} pages{d.error ? ` · ${d.error}` : ""}</span>
              </span>
            </span>
            <span className="quiet">{d.collection}</span>
            <span><StatusPill status={d.status} progress={d.progress} /></span>
            <span className="quiet">{d.uploaded}</span>
            <span className="doc-actions">
              {d.status === "Failed"
                ? <button className="link">Retry</button>
                : <button className="link">Ask</button>}
            </span>
          </div>
        ))}
      </div>
    </section>
  </div>
);

window.Library = Library;
window.FileIcon = FileIcon;
window.StatusPill = StatusPill;
