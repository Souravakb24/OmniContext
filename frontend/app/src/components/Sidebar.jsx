import React from 'react'
import { useAuth } from '../AuthContext.jsx'

const Icon = ({ d, ...rest }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" {...rest}><path d={d}/></svg>
)

const WORKSPACE = [
  { id: 'dashboard', label: 'Dashboard', d: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z' },
  { id: 'library',   label: 'Library',   d: 'M3 7h18M3 12h18M3 17h12' },
  { id: 'ask',       label: 'Ask',       d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
]

const ADMIN = [
  { id: 'members',     label: 'Members',     d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
  { id: 'collections', label: 'Collections', d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
  { id: 'usage',       label: 'Usage',       d: 'M12 21a9 9 0 1 0 -9 -9 M12 7v5l3 2' },
]

const CHEVRON_LEFT  = 'M15 18l-6-6 6-6'
const CHEVRON_RIGHT = 'M9 18l6-6-6-6'

const SunIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="5"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
)
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

export default function Sidebar({ view, setView, collapsed, onToggle, theme, onThemeToggle }) {
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'admin'

  return (
    <aside className={`app-side${collapsed ? ' collapsed' : ''}`}>
      {/* Brand */}
      <a href="/" className="app-brand">
        <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden style={{ flex: 'none' }}>
          <rect width="64" height="64" rx="14" style={{ fill: 'var(--ink)' }} />
          <path d="M 10 36 C 18 24, 24 44, 32 32 S 46 20, 54 32" fill="none" style={{ stroke: 'var(--paper)' }} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="32" cy="32" r="3.2" style={{ fill: 'var(--sand)' }} />
        </svg>
        <span>OmniContext</span>
      </a>

      {/* Collapse toggle */}
      <div className="app-side-toggle">
        <button onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <Icon d={collapsed ? CHEVRON_RIGHT : CHEVRON_LEFT} width="16" height="16" />
        </button>
      </div>

      {/* Workspace nav */}
      <div className="app-nav-group">
        <p className="app-nav-label">Workspace</p>
        {WORKSPACE.map(n => (
          <button
            key={n.id}
            className={`app-nav ${view === n.id ? 'active' : ''}`}
            onClick={() => setView(n.id)}
            title={collapsed ? n.label : undefined}
          >
            <Icon d={n.d} width="16" height="16" />
            {!collapsed && <span>{n.label}</span>}
          </button>
        ))}
      </div>

      {/* Admin nav */}
      {isAdmin && (
        <div className="app-nav-group">
          <p className="app-nav-label">Admin <span className="tag">Admin only</span></p>
          {ADMIN.map(n => (
            <button
              key={n.id}
              className={`app-nav ${view === n.id ? 'active' : ''}`}
              onClick={() => setView(n.id)}
              title={collapsed ? n.label : undefined}
            >
              <Icon d={n.d} width="16" height="16" />
              {!collapsed && <span>{n.label}</span>}
            </button>
          ))}
        </div>
      )}

      {/* User + sign out */}
      <div className="app-side-base">
        <div className="app-user-row" title={collapsed ? `${user?.username} · ${user?.org_name}` : undefined}>
          <span className="avatar" style={{ background: isAdmin ? 'var(--ink)' : 'var(--current)' }}>
            {user?.username?.slice(0,1).toUpperCase()}
          </span>
          <div className="who">
            <b>{user?.username}</b>
            <span>{user?.org_name} · {user?.role}</span>
          </div>
        </div>
        <div className="app-side-foot">
          <button
            className="side-theme-btn"
            onClick={onThemeToggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          </button>
          <button className="link link-quiet" style={{ padding: '4px' }} onClick={logout}>Sign out</button>
        </div>
      </div>
    </aside>
  )
}
