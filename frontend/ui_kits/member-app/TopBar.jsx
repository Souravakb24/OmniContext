// TopBar.jsx — persistent app chrome. Member views show a title; admin views
// show a slim "Admin console" context bar (the admin component supplies its own heading).
const TopBar = ({ title, subtitle, user, slim, tag }) => (
  <header className={`app-top ${slim ? "slim" : ""}`}>
    <div className="app-top-left">
      {slim ? (
        <span className="app-top-crumb"><b>{user.org || "Workspace"}</b> · {title}</span>
      ) : (
        <div>
          <h1 className="app-top-title">{title}</h1>
          {subtitle && <p className="app-top-sub">{subtitle}</p>}
        </div>
      )}
      {tag && (
        <span className="app-top-tag">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2 4 5v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V5l-8-3z"/></svg>
          {tag}
        </span>
      )}
    </div>
    <div className="app-top-right">
      <label className="app-search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input placeholder="Search across all collections" />
        <kbd>⌘ K</kbd>
      </label>
      <div className="app-user">
        <span className="app-user-avatar">{user.username.slice(0,1).toUpperCase()}</span>
        <div>
          <p>{user.username}</p>
          <p className="quiet">{user.role}</p>
        </div>
      </div>
    </div>
  </header>
);

window.TopBar = TopBar;
