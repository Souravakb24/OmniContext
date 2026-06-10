import React, { useState, useEffect } from 'react'
import { useAuth } from '../AuthContext.jsx'
import * as api from '../api.js'
import Modal from './Modal.jsx'
import { useToast } from './Toast.jsx'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const Icon = ({ d, size = 13 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7"><path d={d}/></svg>
)

const DotsIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
    <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
  </svg>
)

function menuPosition(r, menuW = 170, menuH = 130) {
  let left = r.left
  let top = r.bottom + 4
  if (left + menuW > window.innerWidth - 8) left = r.right - menuW
  if (top + menuH > window.innerHeight - 8) top = r.top - menuH - 4
  return { top: Math.max(8, top), left: Math.max(8, left) }
}

export default function MembersTable() {
  const { user } = useAuth()
  const [members, setMembers] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [acting, setActing] = useState(null)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

  const fetchData = async () => {
    setLoading(true)
    try {
      const [m, s] = await Promise.all([api.getOrgUsers(), api.getOrgStats()])
      setMembers(m)
      setStats(s)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const showToast = useToast()

  const ACTION_LABELS = {
    [api.promoteUser]:    u => `${u} promoted to admin.`,
    [api.demoteUser]:     u => `${u} demoted to member.`,
    [api.activateUser]:   u => `${u} activated.`,
    [api.deactivateUser]: u => `${u} deactivated.`,
    [api.deleteUser]:     u => `${u} permanently deleted.`,
  }

  const act = async (fn, username) => {
    setActing(username)
    try {
      await fn(username)
      await fetchData()
      const msg = ACTION_LABELS[fn]?.(username)
      if (msg) showToast(msg)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setActing(null)
      setConfirm(null)
      setDeleteConfirm(null)
      setMenuOpenId(null)
    }
  }

  const isSelf = (username) => username === user?.username

  const openMenu = (m, e) => {
    const pos = menuPosition(e.currentTarget.getBoundingClientRect())
    setMenuPos(pos)
    setMenuOpenId(prev => prev === m.username ? null : m.username)
  }

  const menuMember = members.find(m => m.username === menuOpenId)

  const usedUsers = stats?.limits?.users?.used ?? members.filter(m => m.is_active).length
  const limitUsers = stats?.limits?.users?.limit ?? '?'

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Members</h2>
          <p className="quiet">{usedUsers} of {limitUsers} active</p>
        </div>
      </div>

      {loading ? (
        <p className="quiet">Loading…</p>
      ) : (
        <div className="table">
          <div className="table-row table-head">
            <span>Member</span>
            <span>Role</span>
            <span>Status</span>
            <span>Uploads today</span>
            <span>Joined</span>
            <span></span>
          </div>
          {members.map(m => {
            const uploadUsage = stats?.file_usage_today?.find(u => u.username === m.username)
            const uploaded = uploadUsage?.uploaded ?? 0
            return (
              <div key={m.user_id} className="table-row">
                <span className="member">
                  <span className="avatar">{m.username.slice(0,1).toUpperCase()}</span>
                  <b>{m.username}{isSelf(m.username) ? ' (you)' : ''}</b>
                </span>
                <span>
                  {m.role === 'admin'
                    ? <span className="pill pill-current">Admin</span>
                    : <span className="pill pill-neutral">Member</span>}
                </span>
                <span>
                  {m.is_active
                    ? <span className="pill pill-moss"><span className="pill-dot"/>Active</span>
                    : <span className="pill pill-ember"><span className="pill-dot"/>Disabled</span>}
                </span>
                <span className="quiet">
                  <b className="num">{uploaded}</b> of 5
                  <span className="bar"><span style={{ width: `${uploaded * 20}%` }} /></span>
                </span>
                <span className="quiet">{fmtDate(m.created_at)}</span>
                <span className="actions">
                  {!isSelf(m.username) && (
                    <button
                      className="icon-btn conv-dots"
                      title="Options"
                      onClick={e => openMenu(m, e)}
                    >
                      <DotsIcon />
                    </button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Fixed dropdown menu */}
      {menuOpenId && menuMember && (
        <>
          <div className="conv-menu-scrim" onClick={() => setMenuOpenId(null)} />
          <div className="conv-menu" style={{ top: menuPos.top, left: menuPos.left }}>
            {menuMember.role === 'member' ? (
              <button className="conv-menu-item" disabled={!!acting} onClick={() => act(api.promoteUser, menuMember.username)}>
                <Icon d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" />
                Promote to admin
              </button>
            ) : (
              <button className="conv-menu-item" disabled={!!acting} onClick={() => act(api.demoteUser, menuMember.username)}>
                <Icon d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" />
                Demote to member
              </button>
            )}
            {menuMember.is_active ? (
              <button className="conv-menu-item" disabled={!!acting} onClick={() => { setConfirm(menuMember); setMenuOpenId(null) }}>
                <Icon d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
                Deactivate
              </button>
            ) : (
              <button className="conv-menu-item" disabled={!!acting} onClick={() => act(api.activateUser, menuMember.username)}>
                <Icon d="M5 13l4 4L19 7" />
                Activate
              </button>
            )}
            <button className="conv-menu-item conv-menu-danger" disabled={!!acting} onClick={() => { setDeleteConfirm(menuMember); setMenuOpenId(null) }}>
              <Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              Delete user
            </button>
          </div>
        </>
      )}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Deactivate ${confirm?.username}?`}
        tone="danger"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={!!acting} onClick={() => act(api.deactivateUser, confirm.username)}>
              Deactivate
            </button>
          </>
        }
      >
        <p>They'll be signed out immediately. Their uploaded documents stay in the org library.</p>
        <p className="quiet">You can reactivate them later from this same screen.</p>
      </Modal>

      {deleteConfirm && (
        <>
          <div className="modal-scrim" onClick={() => setDeleteConfirm(null)} />
          <div className="modal modal-danger" role="dialog">
            <header className="modal-head"><h3>Permanently delete {deleteConfirm.username}?</h3></header>
            <div className="modal-body">
              <p>This removes the user account plus <b>all their documents, chunks, and chat history</b> permanently.</p>
              <p className="quiet">This cannot be undone.</p>
            </div>
            <footer className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={!!acting} onClick={() => act(api.deleteUser, deleteConfirm.username)}>
                {acting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </footer>
          </div>
        </>
      )}
    </>
  )
}
