// MembersTable.jsx — list of users with role + status + actions.
const MEMBERS = [
  { username: "priya",   role: "admin",  active: true,  joined: "Jan 4",  uploads_today: 3 },
  { username: "rahul",   role: "admin",  active: true,  joined: "Jan 4",  uploads_today: 0 },
  { username: "ananya",  role: "member", active: true,  joined: "Feb 12", uploads_today: 5 },
  { username: "vikram",  role: "member", active: true,  joined: "Mar 1",  uploads_today: 2 },
  { username: "kavya",   role: "member", active: true,  joined: "Mar 18", uploads_today: 0 },
  { username: "arjun",   role: "member", active: false, joined: "Apr 2",  uploads_today: 0 },
];

const MembersTable = ({ members, setMembers }) => {
  const [confirm, setConfirm] = React.useState(null);

  const update = (username, patch) => {
    setMembers(members.map(m => m.username === username ? { ...m, ...patch } : m));
    setConfirm(null);
  };

  return (
    <React.Fragment>
      <div className="page-head">
        <div>
          <h2 className="page-title">Members</h2>
          <p className="quiet">{members.filter(m => m.active).length} of 10 active · 4 seats left</p>
        </div>
        <button className="btn btn-primary">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14"/></svg>
          Invite a member
        </button>
      </div>

      <div className="table">
        <div className="table-row table-head">
          <span>Member</span>
          <span>Role</span>
          <span>Status</span>
          <span>Uploads today</span>
          <span>Joined</span>
          <span></span>
        </div>
        {members.map(m => (
          <div key={m.username} className="table-row">
            <span className="member">
              <span className="avatar">{m.username.slice(0,1).toUpperCase()}</span>
              <b>{m.username}</b>
            </span>
            <span>
              {m.role === "admin"
                ? <span className="pill pill-current">Admin</span>
                : <span className="pill pill-neutral">Member</span>}
            </span>
            <span>
              {m.active
                ? <span className="pill pill-moss"><span className="pill-dot"/>Active</span>
                : <span className="pill pill-ember"><span className="pill-dot"/>Disabled</span>}
            </span>
            <span className="quiet">
              <b className="num">{m.uploads_today}</b> of 5
              <span className="bar"><span style={{ width: `${m.uploads_today * 20}%` }} /></span>
            </span>
            <span className="quiet">{m.joined}</span>
            <span className="actions">
              {m.role === "member"
                ? <button className="link" onClick={() => update(m.username, { role: "admin" })}>Promote</button>
                : <button className="link link-quiet" onClick={() => update(m.username, { role: "member" })}>Demote</button>}
              {m.active
                ? <button className="link link-danger" onClick={() => setConfirm(m)}>Deactivate</button>
                : <button className="link" onClick={() => update(m.username, { active: true })}>Activate</button>}
            </span>
          </div>
        ))}
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Deactivate ${confirm?.username}?`}
        tone="danger"
        footer={
          <React.Fragment>
            <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => update(confirm.username, { active: false })}>Deactivate</button>
          </React.Fragment>
        }
      >
        <p>They'll be signed out immediately. Their uploaded documents stay in the org library.</p>
        <p className="quiet">You can reactivate them later from this same screen.</p>
      </Modal>
    </React.Fragment>
  );
};

window.MEMBERS = MEMBERS;
window.MembersTable = MembersTable;
