// App.jsx — the unified omnicontext app shell, shared by both entry points.
// Members get Workspace (Library, Ask, Upload). Admins additionally get the
// Admin section (Members, Collections, Usage) and can preview the member view.
// Entry default view comes from window.__APP_DEFAULTS.view.
const ADMIN_VIEWS = ["members", "collections", "usage"];

const Placeholder = ({ title, sub }) => (
  <div className="placeholder"><h2>{title}</h2><p>{sub}</p></div>
);

const App = () => {
  const data = window.MEMBER_DATA;
  const defaults = window.__APP_DEFAULTS || {};

  // The signed-in identity arrives from the login page as URL params
  // (?role=&user=&org=). In production these come from POST /api/auth/login,
  // which returns the role the backend resolved. Fall back to demo data.
  const params = new URLSearchParams(window.location.search);
  const roleParam = params.get("role");
  const user = {
    ...data.user,
    username: params.get("user") || data.user.username,
    role: (roleParam === "admin" || roleParam === "member") ? roleParam : data.user.role,
  };
  const org = { ...data.org, name: params.get("org") || data.org.name };

  const [view, setView] = React.useState(params.get("view") || defaults.view || "library");
  const [drawer, setDrawer] = React.useState(false);
  const [members, setMembers] = React.useState(window.MEMBERS || []);

  const isAdmin = user.role === "admin";
  const onAdminView = ADMIN_VIEWS.includes(view);

  // Non-admins never land on an admin surface.
  React.useEffect(() => {
    if (!isAdmin && onAdminView) setView("library");
  }, [isAdmin, onAdminView]);

  const topUser = { ...user, org: org.name };

  const memberTitles = {
    library: { t: "Your library", s: `${data.collections.length} collections · ${data.documents.length} documents indexed` },
    ask:     { t: "Ask",          s: "Answers cite the page they came from." },
  };
  const adminLabels = { members: "Members", collections: "Collections", usage: "Usage" };

  let body, slim = false, tag = null, title, subtitle;

  if (view === "library") {
    title = memberTitles.library.t; subtitle = memberTitles.library.s;
    body = <Library data={data} onUpload={() => setDrawer(true)} onAsk={() => setView("ask")} />;
  } else if (view === "ask") {
    title = memberTitles.ask.t; subtitle = memberTitles.ask.s;
    body = <AskView initial={data.ask} />;
  } else if (onAdminView) {
    slim = true; tag = "Admin"; title = adminLabels[view];
    const inner =
      view === "members"     ? <MembersTable members={members} setMembers={setMembers} /> :
      view === "collections" ? <CollectionsGrid /> :
                               <UsageDashboard members={members} />;
    body = <div className="admin-main">{inner}</div>;
  } else {
    title = "Not found";
    body = <Placeholder title="Nothing here" sub="Pick a section from the sidebar." />;
  }

  return (
    <React.Fragment>
      <div className="app">
        <Sidebar
          view={view} setView={setView}
          onUpload={() => setDrawer(true)}
          user={user} org={org}
        />
        <div className="app-main">
          <TopBar title={title} subtitle={subtitle} user={topUser} slim={slim} tag={tag} />
          {body}
        </div>
      </div>
      <UploadDrawer open={drawer} onClose={() => setDrawer(false)} collections={data.collections} pipeline={data.pipeline} />
    </React.Fragment>
  );
};

window.App = App;
