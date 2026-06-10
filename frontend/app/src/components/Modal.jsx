import React from 'react'

export default function Modal({ open, onClose, title, children, footer, tone = 'default' }) {
  if (!open) return null
  return (
    <>
      <div className="modal-scrim" onClick={onClose} />
      <div className={`modal modal-${tone}`} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </>
  )
}
