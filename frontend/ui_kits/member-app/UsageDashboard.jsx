// UsageDashboard.jsx — quotas and per-member uploads.
const QuotaBar = ({ label, used, limit, tone }) => {
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <article className="quota">
      <div className="quota-head">
        <span className="quota-label">{label}</span>
        <span className="quota-val"><b>{used}</b> <span className="quiet">of {limit}</span></span>
      </div>
      <div className="quota-bar">
        <div className={`quota-fill quota-fill-${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="quiet">{limit - used} remaining</p>
    </article>
  );
};

const UsageDashboard = ({ members }) => (
  <React.Fragment>
    <div className="page-head">
      <div>
        <h2 className="page-title">Usage</h2>
        <p className="quiet">Today — counters reset at midnight UTC.</p>
      </div>
      <button className="btn btn-secondary">Export CSV</button>
    </div>

    <div className="quota-grid">
      <QuotaBar label="Members"            used={5}  limit={10}      tone="current" />
      <QuotaBar label="Collections"        used={4}  limit={10}      tone="current" />
      <QuotaBar label="Docs in research-papers" used={42} limit={50}  tone="sand" />
      <QuotaBar label="Vectors (org-wide)" used={9810} limit={500000} tone="moss" />
    </div>

    <section className="usage-section">
      <header className="usage-head">
        <h3>Uploads today</h3>
        <p className="quiet">5 per member per day · resets at midnight UTC</p>
      </header>
      <div className="table">
        <div className="table-row table-head" style={{ gridTemplateColumns: "1.6fr 1fr 1.6fr 80px" }}>
          <span>Member</span>
          <span>Uploaded</span>
          <span>Progress</span>
          <span style={{textAlign: "right"}}>Remaining</span>
        </div>
        {members.map(m => (
          <div key={m.username} className="table-row" style={{ gridTemplateColumns: "1.6fr 1fr 1.6fr 80px" }}>
            <span className="member">
              <span className="avatar">{m.username.slice(0,1).toUpperCase()}</span>
              <b>{m.username}</b>
            </span>
            <span className="quiet"><b className="num">{m.uploads_today}</b> of 5</span>
            <span className="bar bar-lg">
              <span style={{ width: `${m.uploads_today * 20}%`, background: m.uploads_today >= 5 ? "var(--ember)" : "var(--current)" }} />
            </span>
            <span className="quiet" style={{textAlign: "right"}}>{5 - m.uploads_today}</span>
          </div>
        ))}
      </div>
    </section>
  </React.Fragment>
);

window.UsageDashboard = UsageDashboard;
