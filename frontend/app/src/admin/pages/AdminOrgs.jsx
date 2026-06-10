import React, { useState, useEffect, useCallback } from 'react'
import { saOrgs, saOrgUsers, saUpdateLimits, saUpdateConsent } from '../adminApi.js'

function shortId(id) {
  return id ? id.slice(0, 8) + '…' : '—'
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Edit Limits Modal ───────────────────────────────────────────────
function LimitsModal({ org, onClose, onSave }) {
  const [maxUsers,   setMaxUsers]   = useState(org.limits?.max_users ?? 10)
  const [maxColls,   setMaxColls]   = useState(org.limits?.max_collections ?? 5)
  const [maxDocs,    setMaxDocs]    = useState(org.limits?.max_docs_per_collection ?? 50)
  const [consent,    setConsent]    = useState(org.data_consent ?? false)
  const [training,   setTraining]   = useState(org.allow_training ?? false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  const handleSave = async () => {
    setLoading(true)
    setError('')
    try {
      await saUpdateLimits(org.org_id, maxUsers, maxColls, maxDocs)
      await saUpdateConsent(org.org_id, consent, training)
      onSave()
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="sa-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sa-drawer" style={{ width: 400 }}>
        <div className="sa-drawer-head">
          <div>
            <h2 className="sa-drawer-title">Edit limits — {org.org_name}</h2>
            <p className="sa-drawer-sub">{org.org_id}</p>
          </div>
          <button className="sa-drawer-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="sa-drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {error && <div className="sa-err-banner">{error}</div>}

          {[
            { label: 'Max users',                  val: maxUsers, set: setMaxUsers },
            { label: 'Max collections',            val: maxColls, set: setMaxColls },
            { label: 'Max docs per collection',    val: maxDocs,  set: setMaxDocs  },
          ].map(({ label, val, set }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ font: '500 12px var(--font-sans)', color: 'var(--ink-2)' }}>{label}</label>
              <input
                type="number" min={1} max={10000} value={val}
                onChange={e => set(Number(e.target.value))}
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--mist-2)', font: '400 14px var(--font-sans)', background: 'var(--paper-soft)', color: 'var(--ink)' }}
              />
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ font: '500 12px var(--font-sans)', color: 'var(--ink-2)' }}>Consent</label>
            {[
              { label: 'Data consent',    val: consent,  set: setConsent  },
              { label: 'Allow training',  val: training, set: setTraining },
            ].map(({ label, val, set }) => (
              <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', font: '400 13px var(--font-sans)', color: 'var(--ink)' }}>
                <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} style={{ width: 15, height: 15 }} />
                {label}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 7, border: '1px solid var(--mist-2)', background: 'var(--paper-soft)', font: '500 13px var(--font-sans)', cursor: 'pointer', color: 'var(--ink-2)' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={loading} style={{ flex: 2, padding: '9px', borderRadius: 7, border: 'none', background: 'var(--current)', color: '#fff', font: '600 13px var(--font-sans)', cursor: 'pointer' }}>
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Users drawer ────────────────────────────────────────────────────
function UsersDrawer({ org, onClose }) {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    saOrgUsers(org.org_id)
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [org.org_id])

  return (
    <div className="sa-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sa-drawer">
        <div className="sa-drawer-head">
          <div>
            <h2 className="sa-drawer-title">Users — {org.org_name}</h2>
            <p className="sa-drawer-sub">{users.length} member(s)</p>
          </div>
          <button className="sa-drawer-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="sa-drawer-body">
          {loading && <div className="sa-loading">Loading…</div>}
          {!loading && users.length === 0 && <div className="sa-empty">No users in this org.</div>}
          {!loading && users.length > 0 && (
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.user_id} style={{ cursor: 'default' }}>
                      <td style={{ fontWeight: 500 }}>{u.username || '—'}</td>
                      <td><span className={`sa-badge ${u.role === 'admin' ? 'accent' : 'neutral'}`}>{u.role}</span></td>
                      <td><span className={`sa-badge ${u.is_active ? 'success' : 'error'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td style={{ color: 'var(--ink-3)', fontSize: 12 }}>{fmtDate(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────
export default function AdminOrgs() {
  const [orgs,         setOrgs]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [editOrg,      setEditOrg]      = useState(null)
  const [usersOrg,     setUsersOrg]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setOrgs(await saOrgs())
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <>
      <div className="sa-topbar">
        <div className="sa-topbar-left">
          <h1 className="sa-page-title">Organisations</h1>
          <p className="sa-page-sub">{orgs.length} organisation(s) on the platform</p>
        </div>
        <div className="sa-topbar-right">
          <button className="sa-refresh-btn" onClick={load}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="sa-content">
        {error && <div className="sa-err-banner">{error}</div>}
        {loading && <div className="sa-loading">Loading…</div>}

        {!loading && !error && (
          <div className="sa-card">
            <div className="sa-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Organisation</th>
                    <th>Users</th>
                    <th>Collections</th>
                    <th>Documents</th>
                    <th>Data Consent</th>
                    <th>Training</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-4)', padding: '32px' }}>No organisations</td></tr>
                  )}
                  {orgs.map(org => (
                    <tr key={org.org_id} style={{ cursor: 'default' }}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{org.org_name}</div>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>{shortId(org.org_id)}</div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{org.user_count}</span>
                        <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>/{org.limits?.max_users ?? '—'}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{org.collection_count}</span>
                        <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>/{org.limits?.max_collections ?? '—'}</span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{org.doc_count}</td>
                      <td><span className={`sa-badge ${org.data_consent ? 'success' : 'neutral'}`}>{org.data_consent ? 'Yes' : 'No'}</span></td>
                      <td><span className={`sa-badge ${org.allow_training ? 'success' : 'neutral'}`}>{org.allow_training ? 'Yes' : 'No'}</span></td>
                      <td style={{ color: 'var(--ink-3)', fontSize: 12 }}>{fmtDate(org.created_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setUsersOrg(org)}
                            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--mist-2)', background: 'var(--paper-soft)', font: '500 11px var(--font-sans)', cursor: 'pointer', color: 'var(--ink-2)' }}
                          >
                            Users
                          </button>
                          <button
                            onClick={() => setEditOrg(org)}
                            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--current)', background: 'var(--current-soft)', font: '500 11px var(--font-sans)', cursor: 'pointer', color: 'var(--current-deep)' }}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editOrg && <LimitsModal org={editOrg} onClose={() => setEditOrg(null)} onSave={load} />}
      {usersOrg && <UsersDrawer org={usersOrg} onClose={() => setUsersOrg(null)} />}
    </>
  )
}
