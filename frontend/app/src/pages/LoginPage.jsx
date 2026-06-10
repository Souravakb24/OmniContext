import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import * as api from '../api.js'

// ── Brand logo SVG ────────────────────────────────────────────────────────────

const Logo = () => (
  <svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#1B2B3D"/>
    <path d="M 10 36 C 18 24, 24 44, 32 32 S 46 20, 54 32" fill="none" stroke="#F5F1E8" strokeWidth="2.4" strokeLinecap="round"/>
    <circle cx="32" cy="32" r="3.2" fill="#D9B271"/>
  </svg>
)

// ── Flowing connector between demo cards ─────────────────────────────────────

function Connector({ flowing }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', height: 14, overflow: 'hidden' }}>
      <div style={{ width: 1, height: '100%', background: 'rgba(27,43,61,0.14)' }} />
      {flowing && (
        <div style={{
          position: 'absolute', top: 0, left: 'calc(50% - 3px)',
          width: 6, height: 6, borderRadius: '50%',
          background: '#2E6F8E', boxShadow: '0 0 8px rgba(46,111,142,0.9)',
          animation: 'connDot 0.62s ease-in forwards',
        }} />
      )}
    </div>
  )
}

// ── Highlights key numbers once the answer finishes ───────────────────────────

function HighlightText({ text }) {
  const parts = text.split(/(23%|\$4\.2M)/g)
  return (
    <>
      {parts.map((p, i) =>
        p === '23%' || p === '$4.2M'
          ? <span key={i} style={{
              color: '#2E6F8E', fontWeight: 700, display: 'inline-block',
              animation: 'numPop 0.45s ease both',
              animationDelay: `${i * 80}ms`,
            }}>{p}</span>
          : p
      )}
    </>
  )
}

// ── Live product demo animation ───────────────────────────────────────────────

function BrandDemo() {
  const [step, setStep]     = useState(0)
  const [chunks, setChunks] = useState(0)
  const [qTyped, setQTyped] = useState('')
  const [aTyped, setATyped] = useState('')
  const [flowing, setFlowing] = useState(-1)
  const prevStepRef = useRef(0)

  const QUERY  = 'What was the Q3 revenue growth?'
  const ANSWER = 'Revenue grew 23% to $4.2M in Q3, driven by enterprise subscriptions.'

  // Reset counters on every step change
  useEffect(() => { setChunks(0); setQTyped(''); setATyped('') }, [step])

  // Trigger connector dot when step advances
  useEffect(() => {
    const prev = prevStepRef.current
    prevStepRef.current = step
    if (step > prev && step > 0) {
      setFlowing(step - 1)
      const t = setTimeout(() => setFlowing(-1), 700)
      return () => clearTimeout(t)
    }
  }, [step])

  // step 0 → 1
  useEffect(() => {
    if (step !== 0) return
    const t = setTimeout(() => setStep(1), 1800)
    return () => clearTimeout(t)
  }, [step])

  // step 1: chunk tiles tick up
  useEffect(() => {
    if (step !== 1) return
    let n = 0
    const iv = setInterval(() => {
      n = Math.min(n + Math.floor(Math.random() * 3) + 1, 24)
      setChunks(n)
      if (n >= 24) clearInterval(iv)
    }, 75)
    return () => clearInterval(iv)
  }, [step])

  // step 1 → 2
  useEffect(() => {
    if (step === 1 && chunks >= 24) {
      const t = setTimeout(() => setStep(2), 650)
      return () => clearTimeout(t)
    }
  }, [step, chunks])

  // step 2: typewriter query
  useEffect(() => {
    if (step !== 2) return
    let i = 0
    const iv = setInterval(() => { i++; setQTyped(QUERY.slice(0, i)); if (i >= QUERY.length) clearInterval(iv) }, 52)
    return () => clearInterval(iv)
  }, [step])

  // step 2 → 3
  useEffect(() => {
    if (step === 2 && qTyped === QUERY) {
      const t = setTimeout(() => setStep(3), 650)
      return () => clearTimeout(t)
    }
  }, [step, qTyped])

  // step 3: typewriter answer
  useEffect(() => {
    if (step !== 3) return
    let i = 0
    const iv = setInterval(() => { i++; setATyped(ANSWER.slice(0, i)); if (i >= ANSWER.length) clearInterval(iv) }, 26)
    return () => clearInterval(iv)
  }, [step])

  // step 3 → 0 (loop)
  useEffect(() => {
    if (step === 3 && aTyped === ANSWER) {
      const t = setTimeout(() => setStep(0), 2800)
      return () => clearTimeout(t)
    }
  }, [step, aTyped])

  // Card state: active / done / upcoming — drives slide-in + dim
  const cs = (idx) =>
    idx === step
      ? { opacity: 1, transform: 'translateY(0)', borderColor: '#2E6F8E', background: '#fff', boxShadow: '0 4px 18px rgba(46,111,142,0.22)' }
      : idx < step
        ? { opacity: 1, transform: 'translateY(0)' }
        : { opacity: 0.42, transform: 'translateY(5px)' }

  const cardBase = {
    borderRadius: 10, padding: '10px 14px',
    border: '1px solid rgba(245,241,232,0.18)',
    background: 'rgba(245,241,232,0.88)',
    fontFamily: 'var(--font-sans)',
    transition: 'opacity 0.42s ease, transform 0.42s ease, border-color 0.42s, background 0.42s, box-shadow 0.42s',
  }
  const lbl  = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(27,43,61,0.4)', fontWeight: 600, marginBottom: 7 }
  const body = { fontSize: 12, color: '#1B2B3D', lineHeight: 1.5 }
  const answerDone = step === 3 && aTyped === ANSWER

  return (
    <div style={{ width: '100%', paddingTop: 4 }}>

      {/* ① Upload */}
      <div style={{ ...cardBase, ...cs(0) }}>
        <div style={lbl}>Document</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="15" height="19" viewBox="0 0 15 19" fill="none" style={{ flexShrink: 0 }}>
            <path d="M2 1h7.5L13 4.5V18H2V1z" fill="rgba(217,178,113,0.12)" stroke="#D9B271" strokeWidth="1.1"/>
            <path d="M9.5 1v3.5H13" fill="none" stroke="#D9B271" strokeWidth="1.1"/>
            <path d="M4 8h7M4 11h5" stroke="rgba(217,178,113,0.45)" strokeWidth="0.9" strokeLinecap="round"/>
          </svg>
          <span style={{ ...body, flex: 1 }}>annual_report.pdf</span>
          <span style={{ fontSize: 10, fontWeight: 600, transition: 'color 0.4s', color: step >= 1 ? '#1A8A68' : 'rgba(27,43,61,0.35)' }}>
            {step === 0 ? 'Uploading…' : '✓ Uploaded'}
          </span>
        </div>
      </div>

      <Connector flowing={flowing === 0} />

      {/* ② Indexing — chunk tile grid */}
      <div style={{ ...cardBase, ...cs(1) }}>
        <div style={lbl}>Processing</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: 2,
              background: i < chunks ? '#2E6F8E' : 'rgba(27,43,61,0.09)',
              transition: 'background 0.12s',
              ...(i === chunks - 1 && chunks > 0 ? { animation: 'chunkPop 0.22s ease both' } : {}),
            }} />
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(27,43,61,0.5)' }}>
          {step === 1
            ? (chunks < 24 ? `Chunking & embedding… ${chunks} / 24` : 'Indexing complete — 24 chunks')
            : step > 1 ? '✓ Indexed 24 chunks' : 'Ready to process'}
        </div>
      </div>

      <Connector flowing={flowing === 1} />

      {/* ③ Query */}
      <div style={{ ...cardBase, ...cs(2) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
          <div style={lbl}>Ask</div>
          <div className={step === 2 ? 'brand-live-dot' : ''}
               style={{ width: 6, height: 6, borderRadius: '50%', background: '#2E6F8E',
                        marginBottom: 7, opacity: step === 2 ? 1 : 0,
                        transition: 'opacity 0.3s', boxShadow: '0 0 6px #2E6F8E' }} />
        </div>
        <div style={{ ...body, minHeight: 18, fontStyle: 'italic' }}>
          {step >= 2
            ? (<>{qTyped}{step === 2 && qTyped.length < QUERY.length && <span style={{ borderRight: '1.5px solid #2E6F8E', marginLeft: 1 }}>&nbsp;</span>}</>)
            : <span style={{ color: 'rgba(27,43,61,0.2)' }}>Awaiting query…</span>}
        </div>
      </div>

      <Connector flowing={flowing === 2} />

      {/* ④ Answer */}
      <div style={{ ...cardBase, ...cs(3), marginBottom: 0 }}>
        <div style={lbl}>Answer</div>
        <div style={{ ...body, minHeight: 36 }}>
          {step === 3
            ? (answerDone ? <HighlightText text={aTyped} /> : aTyped)
            : <span style={{ color: 'rgba(27,43,61,0.2)' }}>…</span>}
        </div>
        {answerDone && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
            background: 'rgba(217,178,113,0.18)', border: '1px solid rgba(180,140,70,0.45)',
            borderRadius: 20, padding: '3px 9px', fontSize: 10, color: '#9A6B10', fontWeight: 600,
            animation: 'fadeSlideUp 0.35s ease both',
          }}>
            <svg width="9" height="11" viewBox="0 0 9 11" fill="none">
              <path d="M1 1h4.5l2.5 2.5V10H1V1z" fill="none" stroke="#9A6B10" strokeWidth="1"/>
            </svg>
            annual_report.pdf · p.12
          </div>
        )}
      </div>

    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--ink)', color: 'var(--paper)', font: '500 13px var(--font-sans)',
      padding: '10px 20px', borderRadius: 99, zIndex: 999, whiteSpace: 'nowrap',
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      animation: 'fadeUp 0.22s ease',
    }}>
      {msg}
    </div>
  )
}

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
  </svg>
)

export default function LoginPage() {
  const { login, token } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab]         = useState('in')   // 'in' | 'up'
  const [orgMode, setOrgMode] = useState('new')  // 'new' | 'join'  (signup only)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [toast, setToast]     = useState(false)

  // sign-in fields
  const [siOrg,  setSiOrg]  = useState('')
  const [siUser, setSiUser] = useState('')
  const [siPass, setSiPass] = useState('')

  // create-org fields
  const [coOrg,      setCoOrg]      = useState('')
  const [coUser,     setCoUser]     = useState('')
  const [coPass,     setCoPass]     = useState('')
  const [coPass2,    setCoPass2]    = useState('')
  const [coMaxUsers, setCoMaxUsers] = useState(10)

  // join-org fields
  const [orgs,   setOrgs]   = useState([])
  const [joOrg,  setJoOrg]  = useState('')
  const [joUser, setJoUser] = useState('')
  const [joPass, setJoPass] = useState('')
  const [joPass2,setJoPass2]= useState('')

  useEffect(() => {
    if (token) navigate('/app', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (tab === 'up' && orgMode === 'join') {
      api.listOrgs().then(data => {
        setOrgs(data)
        if (data.length && !joOrg) setJoOrg(data[0].org_name)
      }).catch(() => {})
    }
  }, [tab, orgMode])

  const changeTab = (t) => { setTab(t); setError('') }
  const changeOrgMode = (m) => { setOrgMode(m); setError('') }

  // ── Sign in ──
  const handleSignIn = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(siOrg.trim(), siUser.trim(), siPass)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(
        err.status === 401 ? 'Wrong password or username.' :
        err.status === 403 ? 'Your account has been deactivated.' :
        err.status === 404 ? 'Organisation not found.' :
        err.message || 'Something went wrong.'
      )
    } finally {
      setLoading(false)
    }
  }

  // ── Create org ──
  const handleCreateOrg = async (e) => {
    e.preventDefault()
    if (coPass !== coPass2) { setError('Passwords do not match.'); return }
    setError('')
    setLoading(true)
    try {
      await api.registerOrg(coOrg.trim(), coMaxUsers, 5, 50)
      await api.registerUser(coOrg.trim(), coUser.trim(), coPass)
      await login(coOrg.trim(), coUser.trim(), coPass)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(
        err.status === 409 ? 'Organisation name or username already taken.' :
        err.status === 400 ? 'Password must be at least 8 characters.' :
        err.message || 'Something went wrong.'
      )
    } finally {
      setLoading(false)
    }
  }

  // ── Join org ──
  const handleJoinOrg = async (e) => {
    e.preventDefault()
    if (joPass !== joPass2) { setError('Passwords do not match.'); return }
    setError('')
    setLoading(true)
    try {
      await api.registerUser(joOrg, joUser.trim(), joPass)
      await login(joOrg, joUser.trim(), joPass)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(
        err.status === 409 ? 'Username already taken in this organisation.' :
        err.status === 429 ? 'This organisation has reached its user limit.' :
        err.status === 400 ? 'Password must be at least 8 characters.' :
        err.message || 'Something went wrong.'
      )
    } finally {
      setLoading(false)
    }
  }

  const isSignup = tab === 'up'

  return (
    <>
      <style>{`
        @keyframes lpDrift { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes lpGlow  { 0%,100% { opacity: .35; } 50% { opacity: .8; } }
        @keyframes fadeUp  { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
      {toast && <Toast msg="Google sign-in coming soon" onDone={() => setToast(false)} />}

      <div className="auth-page">

        {/* ── LEFT brand panel ── */}
        <aside className="auth-brand">
          <div className="auth-aurora" aria-hidden="true">
            <div className="auth-aurora-1" />
            <div className="auth-aurora-2" />
            <div className="auth-aurora-3" />
          </div>

          <Link className="auth-brand-logo" to="/">
            <Logo />
            <b>OmniContext</b>
          </Link>

          <div className="auth-brand-mid">
            <h1>Ask your documents<br/><em>anything.</em></h1>
            <p>Sign in to your workspace — upload, organize, and get cited answers from everything your team knows.</p>
            <div className="auth-brand-visual">
              <BrandDemo />
            </div>
          </div>

          <div className="auth-brand-foot">Smarter document intelligence for modern teams.</div>
        </aside>

        {/* ── RIGHT form panel ── */}
        <main className="auth-form-side">
          <Link className="auth-back" to="/">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to site
          </Link>

          <div className="auth-card">
            <div className="auth-card-head">
              <h2>{isSignup ? 'Create your account.' : 'Welcome back.'}</h2>
              <p>{isSignup ? 'Start a workspace or join your team.' : 'Sign in to your workspace.'}</p>
            </div>

            {/* tab toggle */}
            <div className="auth-seg" role="tablist">
              <button className={tab === 'in' ? 'on' : ''} onClick={() => changeTab('in')}>Sign in</button>
              <button className={tab === 'up' ? 'on' : ''} onClick={() => changeTab('up')}>Create account</button>
            </div>

            {/* Google button + divider */}
            <button className="auth-google" onClick={() => setToast(true)} type="button">
              <GoogleLogo />
              Continue with Google
            </button>
            <div className="auth-divider"><span>or</span></div>

            {/* ── SIGN IN FORM ── */}
            {tab === 'in' && (
              <form className="auth-form" onSubmit={handleSignIn}>
                {error && <p className="auth-err">{error}</p>}
                <div className="auth-field">
                  <label htmlFor="si-org">Organisation</label>
                  <input id="si-org" type="text" value={siOrg} onChange={e => setSiOrg(e.target.value)}
                    placeholder="IIT_Mandi" autoComplete="organization" required autoFocus />
                </div>
                <div className="auth-field">
                  <label htmlFor="si-user">Username</label>
                  <input id="si-user" type="text" value={siUser} onChange={e => setSiUser(e.target.value)}
                    placeholder="rahul" autoComplete="username" required />
                </div>
                <div className="auth-field">
                  <label htmlFor="si-pass">Password</label>
                  <input id="si-pass" type="password" value={siPass} onChange={e => setSiPass(e.target.value)}
                    placeholder="••••••••" autoComplete="current-password" required />
                </div>
                <button className="auth-submit" type="submit" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}

            {/* ── CREATE ACCOUNT FORM ── */}
            {tab === 'up' && (
              <form className="auth-form" onSubmit={orgMode === 'new' ? handleCreateOrg : handleJoinOrg}>
                {error && <p className="auth-err">{error}</p>}

                {/* New org / Join existing chooser */}
                <div className="auth-orgmode">
                  <label className={orgMode === 'new' ? 'sel' : ''} onClick={() => changeOrgMode('new')}>
                    <span className="auth-om-title">New organisation</span>
                    <span className="auth-om-sub">You'll be the admin</span>
                  </label>
                  <label className={orgMode === 'join' ? 'sel' : ''} onClick={() => changeOrgMode('join')}>
                    <span className="auth-om-title">Join existing</span>
                    <span className="auth-om-sub">Your team already uses it</span>
                  </label>
                </div>

                {/* Org field */}
                <div className="auth-field">
                  <label htmlFor="up-org">
                    {orgMode === 'new' ? 'Name your organisation' : 'Organisation to join'}
                  </label>
                  {orgMode === 'new' ? (
                    <>
                      <input id="up-org" type="text" value={coOrg} onChange={e => setCoOrg(e.target.value)}
                        placeholder="iit-mandi-research" autoComplete="organization" required autoFocus />
                      <span className="auth-hint">Lowercase, hyphens, no spaces. This becomes your workspace.</span>
                    </>
                  ) : (
                    <select id="up-org" value={joOrg} onChange={e => setJoOrg(e.target.value)} required autoFocus>
                      {orgs.length === 0 && <option value="">Loading…</option>}
                      {orgs.map(o => <option key={o.org_id} value={o.org_name}>{o.org_name}</option>)}
                    </select>
                  )}
                </div>

                {/* Max users (new org only) */}
                {orgMode === 'new' && (
                  <div className="auth-field">
                    <label htmlFor="up-max">Max users</label>
                    <input id="up-max" type="number" min={1} max={500} value={coMaxUsers}
                      onChange={e => setCoMaxUsers(Number(e.target.value))} required />
                  </div>
                )}

                {/* Username */}
                <div className="auth-field">
                  <label htmlFor="up-user">Username</label>
                  <input id="up-user" type="text"
                    value={orgMode === 'new' ? coUser : joUser}
                    onChange={e => orgMode === 'new' ? setCoUser(e.target.value) : setJoUser(e.target.value)}
                    placeholder="rahul" autoComplete="username" required />
                </div>

                {/* Password */}
                <div className="auth-field">
                  <label htmlFor="up-pass">Password</label>
                  <input id="up-pass" type="password"
                    value={orgMode === 'new' ? coPass : joPass}
                    onChange={e => orgMode === 'new' ? setCoPass(e.target.value) : setJoPass(e.target.value)}
                    placeholder="Min 8 characters" autoComplete="new-password" required minLength={8} />
                </div>

                {/* Confirm password */}
                <div className="auth-field">
                  <label htmlFor="up-pass2">Confirm password</label>
                  <input id="up-pass2" type="password"
                    value={orgMode === 'new' ? coPass2 : joPass2}
                    onChange={e => orgMode === 'new' ? setCoPass2(e.target.value) : setJoPass2(e.target.value)}
                    placeholder="••••••••" autoComplete="new-password" required />
                </div>

                <button className="auth-submit" type="submit" disabled={loading || (orgMode === 'join' && !joOrg)}>
                  {loading
                    ? (orgMode === 'new' ? 'Creating…' : 'Joining…')
                    : (orgMode === 'new' ? 'Create organisation' : 'Join organisation')}
                </button>
              </form>
            )}

            <p className="auth-switch">
              {isSignup
                ? <>Already have an account? <button onClick={() => changeTab('in')}>Sign in</button></>
                : <>New to OmniContext? <button onClick={() => changeTab('up')}>Create an account</button></>
              }
            </p>

            <p className="auth-legal">
              By continuing you agree to the <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.
            </p>
          </div>
        </main>
      </div>
    </>
  )
}
