// UploadDrawer.jsx — right-side drawer for upload + synthetic ingestion log.
const UploadDrawer = ({ open, onClose, collections, pipeline }) => {
  const [collection, setCollection] = React.useState(collections[0]?.name || "");
  const [file, setFile] = React.useState(null);
  const [step, setStep] = React.useState(-1); // -1 idle, 0..pipeline.length-1, done
  const [drag, setDrag] = React.useState(false);

  React.useEffect(() => {
    if (step < 0 || step >= pipeline.length - 1) return;
    const id = setTimeout(() => setStep(s => s + 1), 900);
    return () => clearTimeout(id);
  }, [step, pipeline.length]);

  const handleFile = f => {
    setFile(f);
    setStep(0);
  };
  const reset = () => { setFile(null); setStep(-1); };

  if (!open) return null;

  return (
    <React.Fragment>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <h3>Upload a document</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </header>

        <div className="drawer-body">
          <label className="field">
            <span className="field-label">Collection</span>
            <select value={collection} onChange={e => setCollection(e.target.value)} disabled={step >= 0}>
              {collections.map(c => <option key={c.id}>{c.name}</option>)}
            </select>
          </label>

          {!file && (
            <label
              className={`dropzone ${drag ? "is-drag" : ""}`}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#2E6F8E" strokeWidth="1.5"><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>
              <p><b>Drop a file</b> or <span className="link">browse</span></p>
              <p className="quiet">PDF · DOCX · PPT · PPTX up to 50 MB</p>
              <input type="file" accept=".pdf,.docx,.ppt,.pptx" onChange={e => e.target.files[0] && handleFile(e.target.files[0])} hidden />
            </label>
          )}

          {file && (
            <div className="ingest">
              <div className="ingest-file">
                <FileIcon ext={(file.name.split('.').pop() || 'pdf').toLowerCase()} />
                <div>
                  <b>{file.name}</b>
                  <span className="quiet">{(file.size / 1024).toFixed(0)} KB · → {collection}</span>
                </div>
              </div>
              <ol className="ingest-log">
                {pipeline.map((p, i) => {
                  const state = i < step ? "done" : i === step ? "active" : "wait";
                  return (
                    <li key={p} className={`ingest-step is-${state}`}>
                      <span className="ingest-tick">
                        {state === "done" && (
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6L9 17l-5-5"/></svg>
                        )}
                        {state === "active" && <span className="spinner" />}
                      </span>
                      <span className="ingest-name">{p}</span>
                      <span className="ingest-time mono">
                        {state === "done" ? `${(0.4 + i * 0.3).toFixed(1)}s` : state === "active" ? "running…" : "—"}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {step === pipeline.length - 1 && (
                <div className="ingest-done">
                  <p><b>Indexed.</b> {file.name} is searchable across <code>{collection}</code>.</p>
                  <div className="ingest-actions">
                    <button className="btn btn-primary">Ask a question</button>
                    <button className="btn btn-secondary" onClick={reset}>Upload another</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </React.Fragment>
  );
};

window.UploadDrawer = UploadDrawer;
