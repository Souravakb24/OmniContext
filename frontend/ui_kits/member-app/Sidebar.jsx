// Sidebar.jsx — unified nav. Workspace for everyone; Admin section only for admins.
// A role switcher lets an admin preview the plain-member experience.
const Icon = ({ d, ...rest }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...rest}><path d={d}/></svg>
);

const WORKSPACE = [
  { id: "library", label: "Library", d: "M3 7h18M3 12h18M3 17h12" },
  { id: "ask",     label: "Ask",     d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
];

const ADMIN = [
  { id: "members",     label: "Members",     d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" },
  { id: "collections", label: "Collections", d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" },
  { id: "usage",       label: "Usage",       d: "M12 21a9 9 0 1 0 -9 -9 M12 7v5l3 2" },
];

const Sidebar = ({ view, setView, onUpload, user, org }) => {
  const isAdmin = user.role === "admin";
  return (
    <aside className="app-side">
      <a href="../../Omnicontext Landing.html" className="app-brand">
        <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden>
          <rect width="64" height="64" rx="14" fill="#0E1B2C" />
          <path d="M 10 36 C 18 24, 24 44, 32 32 S 46 20, 54 32" fill="none" stroke="#F5F1E8" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="32" cy="32" r="3.2" fill="#D9B271" />
        </svg>
        <span>omnicontext</span>
      </a>

      <button className="btn btn-primary btn-block app-upload-btn" onClick={onUpload}>
        <Icon d="M12 16V4M6 10l6-6 6 6M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" width="16" height="16"/>
        Upload a document
      </button>

      <div className="app-nav-group">
        <p className="app-nav-label">Workspace</p>
        {WORKSPACE.map(n => (
          <button key={n.id} className={`app-nav ${view === n.id ? "active" : ""}`} onClick={() => setView(n.id)}>
            <Icon d={n.d} width="16" height="16" />
            {n.label}
          </button>
        ))}
      </div>

      {isAdmin && (
        <div className="app-nav-group">
          <p className="app-nav-label">Admin <span className="tag">Admin only</span></p>
          {ADMIN.map(n => (
            <button key={n.id} className={`app-nav ${view === n.id ? "active" : ""}`} onClick={() => setView(n.id)}>
              <Icon d={n.d} width="16" height="16" />
              {n.label}
            </button>
          ))}
        </div>
      )}

      <div className="app-side-base">
        <div className="app-user-row">
          <span className="avatar" style={{ background: isAdmin ? "var(--ink)" : "var(--current)" }}>
            {user.username.slice(0,1).toUpperCase()}
          </span>
          <div className="who">
            <b>{user.username}</b>
            <span>{org.name} · {user.role}</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

window.Sidebar = Sidebar;
