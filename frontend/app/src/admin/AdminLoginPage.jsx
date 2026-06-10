import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from './AdminAuthContext.jsx'
import './admin.css'

const ShieldIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
)

export default function AdminLoginPage() {
  const { saToken, login } = useAdminAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (saToken) navigate('/admin/overview', { replace: true })
  }, [saToken, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username.trim(), password)
      navigate('/admin/overview', { replace: true })
    } catch (err) {
      setError(
        err.status === 401 ? 'Invalid username or password.' :
        err.message || 'Login failed. Try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="sa-login-page">
      <div className="sa-login-card">
        <div className="sa-login-head">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: 'var(--ink)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'var(--current)',
            }}>
              <ShieldIcon />
            </div>
          </div>
          <h1>Super Admin</h1>
          <p>Restricted access — authorised personnel only</p>
        </div>

        <form className="sa-login-form" onSubmit={handleSubmit}>
          {error && <div className="sa-err-banner">{error}</div>}

          <div className="sa-login-field">
            <label htmlFor="sa-user">Username</label>
            <input
              id="sa-user"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="sa-login-field">
            <label htmlFor="sa-pass">Password</label>
            <input
              id="sa-pass"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button className="sa-login-submit" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in to admin console'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, font: '400 11px var(--font-sans)', color: 'var(--ink-4)' }}>
          Access is logged. Unauthorised access is prohibited.
        </p>
      </div>
    </div>
  )
}
