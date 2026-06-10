import React from 'react'
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import { useAdminAuth } from './AdminAuthContext.jsx'
import './admin.css'

import AdminOverview    from './pages/AdminOverview.jsx'
import AdminOrgs        from './pages/AdminOrgs.jsx'
import AdminIngestion   from './pages/AdminIngestion.jsx'
import AdminQueries     from './pages/AdminQueries.jsx'
import QueryDetail      from './pages/QueryDetail.jsx'
import AdminTokens      from './pages/AdminTokens.jsx'
import AdminErrors      from './pages/AdminErrors.jsx'
import AdminStoreHealth from './pages/AdminStoreHealth.jsx'
import AdminSessions    from './pages/AdminSessions.jsx'
import SessionDetail    from './pages/SessionDetail.jsx'

// ── Icons ──────────────────────────────────────────────────────────
const Icon = ({ d, d2 }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
)

const NAV = [
  {
    group: 'Platform',
    items: [
      { to: 'overview',    label: 'Overview',     d: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', d2: 'M9 22V12h6v10' },
      { to: 'orgs',        label: 'Organisations', d: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
    ],
  },
  {
    group: 'Logs',
    items: [
      { to: 'ingestion',    label: 'Ingestion',    d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4', d2: 'M7 10l5 5 5-5M12 15V3' },
      { to: 'sessions',     label: 'Sessions',     d: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' },
      { to: 'tokens',       label: 'Token Usage',  d: 'M18 20V10M12 20V4M6 20v-6' },
      { to: 'errors',       label: 'Errors',       d: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', d2: 'M12 9v4M12 17h.01' },
      { to: 'store-health', label: 'Store Health', d: 'M22 12h-4l-3 9L9 3l-3 9H2' },
    ],
  },
]

// ── Private route guard ─────────────────────────────────────────────
function AdminPrivateRoute({ children }) {
  const { saToken } = useAdminAuth()
  return saToken ? children : <Navigate to="/admin" replace />
}

// ── Sidebar nav item ────────────────────────────────────────────────
function NavItem({ to, label, d, d2 }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) => `sa-nav${isActive ? ' active' : ''}`}
    >
      <Icon d={d} d2={d2} />
      <span>{label}</span>
    </NavLink>
  )
}

// ── Shell ───────────────────────────────────────────────────────────
export default function AdminShell() {
  const { saUser, logout } = useAdminAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/admin', { replace: true })
  }

  return (
    <AdminPrivateRoute>
      <div className="sa-shell">

        {/* Sidebar */}
        <aside className="sa-side">
          <div className="sa-brand">
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'var(--current)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div className="sa-brand-name">OmniContext</div>
              <div className="sa-brand-badge">Admin</div>
            </div>
          </div>

          {NAV.map(group => (
            <div key={group.group}>
              <div className="sa-nav-group-label">{group.group}</div>
              {group.items.map(item => (
                <NavItem key={item.to} {...item} />
              ))}
            </div>
          ))}

          <div className="sa-side-foot">
            <div className="sa-who">
              <div className="sa-avatar">{(saUser || 'A')[0].toUpperCase()}</div>
              <span className="sa-who-name">{saUser || 'Admin'}</span>
            </div>
            <button className="sa-logout" onClick={handleLogout}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
              Sign out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="sa-main">
          <Routes>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview"            element={<AdminOverview />} />
            <Route path="orgs"                element={<AdminOrgs />} />
            <Route path="ingestion"           element={<AdminIngestion />} />
            <Route path="sessions"            element={<AdminSessions />} />
            <Route path="sessions/:sessionId" element={<SessionDetail />} />
            <Route path="queries"             element={<AdminQueries />} />
            <Route path="queries/:queryId"    element={<QueryDetail />} />
            <Route path="tokens"              element={<AdminTokens />} />
            <Route path="errors"              element={<AdminErrors />} />
            <Route path="store-health"        element={<AdminStoreHealth />} />
            <Route path="*"                   element={<Navigate to="overview" replace />} />
          </Routes>
        </main>

      </div>
    </AdminPrivateRoute>
  )
}
