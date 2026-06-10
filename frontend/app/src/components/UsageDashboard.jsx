import React, { useState, useEffect } from 'react'
import * as api from '../api.js'

const QuotaBar = ({ label, used, limit, tone }) => {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
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
  )
}

export default function UsageDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getOrgStats().then(s => { setStats(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <p className="quiet">Loading…</p>
  if (!stats) return <p className="quiet">Could not load usage data.</p>

  const users = stats.limits?.users ?? { used: 0, limit: 0 }
  const cols  = stats.limits?.collections ?? { used: 0, limit: 0 }
  const today = stats.file_usage_today ?? []

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Usage</h2>
          <p className="quiet">Today — counters reset at midnight UTC.</p>
        </div>
      </div>

      <div className="quota-grid">
        <QuotaBar label="Members"     used={users.used} limit={users.limit} tone="current" />
        <QuotaBar label="Collections" used={cols.used}  limit={cols.limit}  tone="current" />
      </div>

      {today.length > 0 && (
        <section className="usage-section">
          <header className="usage-head">
            <h3>Uploads today</h3>
            <p className="quiet">5 per member per day · resets at midnight UTC</p>
          </header>
          <div className="table">
            <div className="table-row table-head" style={{ gridTemplateColumns: '1.6fr 1fr 1.6fr 80px' }}>
              <span>Member</span>
              <span>Uploaded</span>
              <span>Progress</span>
              <span style={{ textAlign: 'right' }}>Remaining</span>
            </div>
            {today.map(m => (
              <div key={m.username} className="table-row" style={{ gridTemplateColumns: '1.6fr 1fr 1.6fr 80px' }}>
                <span className="member">
                  <span className="avatar">{m.username.slice(0,1).toUpperCase()}</span>
                  <b>{m.username}</b>
                </span>
                <span className="quiet"><b className="num">{m.uploaded}</b> of 5</span>
                <span className="bar bar-lg">
                  <span style={{ width: `${m.uploaded * 20}%`, background: m.uploaded >= 5 ? 'var(--ember)' : 'var(--current)' }} />
                </span>
                <span className="quiet" style={{ textAlign: 'right' }}>{m.remaining}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
