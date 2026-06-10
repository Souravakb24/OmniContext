import React from 'react'
import { useAuth } from '../AuthContext.jsx'

const SunIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
)

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark'
  return (
    <div className="theme-toggle-wrap">
      <span className={`theme-toggle-icon ${!isDark ? 'active' : ''}`}><SunIcon /></span>
      <button
        className={`theme-toggle ${isDark ? 'is-dark' : ''}`}
        onClick={onToggle}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-checked={isDark}
        role="switch"
      >
        <span className="theme-toggle-thumb" />
      </button>
      <span className={`theme-toggle-icon ${isDark ? 'active' : ''}`}><MoonIcon /></span>
    </div>
  )
}

export default function TopBar({ title, subtitle, slim, tag, theme, onThemeToggle }) {
  const { user } = useAuth()
  return (
    <header className={`app-top ${slim ? 'slim' : ''}`}>
      <div className="app-top-left">
        {slim ? (
          <span className="app-top-crumb"><b>{user?.org_name || 'Workspace'}</b> · {title}</span>
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
        </label>
        <ThemeToggle theme={theme} onToggle={onThemeToggle} />
      </div>
    </header>
  )
}
