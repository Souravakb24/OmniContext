// CollectionsGrid.jsx — list of collections with create modal.
const COLLECTIONS = [
  { name: "research-papers",  description: "Peer-reviewed RAG + retrieval work.", doc_count: 42, vector_count: 3120, owner: "priya",   updated: "2 days ago" },
  { name: "internal-docs",    description: "Decks, briefs, retros, OKRs.",        doc_count: 18, vector_count: 1408, owner: "rahul",   updated: "today" },
  { name: "customer-calls",   description: "Transcripts from Gong + Otter.",      doc_count: 64, vector_count: 4870, owner: "ananya",  updated: "3 hr ago" },
  { name: "legal-contracts",  description: "MSAs, DPAs, vendor agreements.",      doc_count: 7,  vector_count: 412,  owner: "priya",   updated: "1 week ago" },
];

const CollectionsGrid = () => {
  const [list, setList] = React.useState(COLLECTIONS);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");

  const create = () => {
    if (!name.trim()) return;
    setList([{ name: name.trim(), description: desc.trim() || "—", doc_count: 0, vector_count: 0, owner: "priya", updated: "just now" }, ...list]);
    setName(""); setDesc(""); setOpen(false);
  };

  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h2 className="page-title">Collections</h2>
          <p className="quiet">{list.length} of 10 used · vector quota 50,000 / collection</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14"/></svg>
          New collection
        </button>
      </div>

      <div className="collections-grid">
        {list.map(c => (
          <article key={c.name} className="coll-card">
            <header className="coll-card-head">
              <div className="coll-card-title">
                <h3>{c.name}</h3>
                <p>{c.description}</p>
              </div>
              <button className="icon-btn" aria-label="More">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
              </button>
            </header>
            <dl className="coll-stats">
              <div><dt>Documents</dt><dd>{c.doc_count} <span className="quiet">/ 50</span></dd></div>
              <div><dt>Chunks</dt><dd>{c.vector_count.toLocaleString()} <span className="quiet">/ 50k</span></dd></div>
              <div><dt>Owner</dt><dd>{c.owner}</dd></div>
            </dl>
            <footer className="coll-card-foot">
              <span className="quiet">Updated {c.updated}</span>
              <button className="link">Open →</button>
            </footer>
          </article>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New collection"
        footer={
          <React.Fragment>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={create}>Create collection</button>
          </React.Fragment>
        }
      >
        <label className="field">
          <span className="field-label">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="research-papers" autoFocus />
          <span className="quiet">Lowercase, hyphens, no spaces. Used in API paths.</span>
        </label>
        <label className="field">
          <span className="field-label">Description</span>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="One line. What lives here?" rows={3} />
        </label>
      </Modal>
    </React.Fragment>
  );
};

window.CollectionsGrid = CollectionsGrid;
