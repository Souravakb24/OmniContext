import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import BLOG_POSTS from '../data/blogPosts'
import './LandingPage.css'
import './BlogPage.css'

const Logo = () => (
  <svg className="mk" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#0E1B2C"/>
    <path d="M 10 36 C 18 24, 24 44, 32 32 S 46 20, 54 32" fill="none" stroke="#F5F1E8" strokeWidth="2.4" strokeLinecap="round"/>
    <circle cx="32" cy="32" r="3.2" fill="#D9B271"/>
  </svg>
)

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function BlogCard({ post }) {
  const href = post.externalUrl || `/blog/${post.slug}`
  const isExternal = !!post.externalUrl

  return (
    <a
      className="blog-card"
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
    >
      <div className="blog-card-top">
        <span className="blog-tag">{post.tag}</span>
        {isExternal && (
          <span className="blog-ext">
            Medium
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17L17 7M7 7h10v10"/>
            </svg>
          </span>
        )}
      </div>
      <h2 className="blog-card-title">{post.title}</h2>
      <p className="blog-card-sub">{post.subtitle}</p>
      <div className="blog-card-foot">
        <div className="blog-author">
          <span className="blog-avatar">{post.authorInitials}</span>
          <span className="blog-author-name">{post.author}</span>
        </div>
        <span className="blog-meta">{formatDate(post.date)} · {post.readTime}</span>
      </div>
    </a>
  )
}

export default function BlogPage() {
  const hdrRef = useRef(null)

  useEffect(() => {
    const hdr = hdrRef.current
    if (!hdr) return
    const onScroll = () => hdr.classList.toggle('scrolled', window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="oc-landing">

      {/* ── HEADER ── */}
      <header className="hdr" ref={hdrRef}>
        <div className="wrap hdr-in">
          <Link className="brand" to="/">
            <Logo />
            <b>OmniContext</b>
          </Link>
          <nav className="nav">
            <Link to="/#how">How it works</Link>
            <Link to="/#cases">Use cases</Link>
            <Link to="/#about">About</Link>
            <Link to="/#faq">FAQ</Link>
            <Link to="/blog" className="nav-active">Blog</Link>
          </nav>
          <div className="hdr-cta">
            <Link className="signin" to="/login">Sign in</Link>
            <Link className="btn btn-primary" to="/login" style={{ padding: '10px 16px', fontSize: '14px' }}>Get started</Link>
          </div>
        </div>
      </header>

      {/* ── BLOG HERO ── */}
      <section className="blog-hero">
        <div className="wrap">
          <p className="eyebrow">From the team</p>
          <h1 className="blog-hero-title">Writing on AI,<br/>documents, and building.</h1>
          <p className="blog-hero-sub">Lessons from building OmniContext — on RAG systems, document intelligence, and the messy reality of making AI useful.</p>
        </div>
      </section>

      {/* ── POSTS GRID ── */}
      <section className="blog-body">
        <div className="wrap">
          {BLOG_POSTS.length === 0 ? (
            <p className="blog-empty">No posts yet — check back soon.</p>
          ) : (
            <div className="blog-grid">
              {BLOG_POSTS.map(p => <BlogCard key={p.slug} post={p} />)}
            </div>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="ftr">
        <div className="wrap">
          <div className="ftr-in">
            <div className="ftr-brand">
              <div className="ftr-brand-row"><Logo /><b>OmniContext</b></div>
              <p className="ftr-line">Smarter document intelligence for modern teams.</p>
            </div>
            <div className="ftr-cols">
              <div>
                <p className="ov">Product</p>
                <Link to="/#what">What it does</Link>
                <Link to="/#how">How it works</Link>
                <Link to="/#cases">Use cases</Link>
              </div>
              <div>
                <p className="ov">Company</p>
                <Link to="/#about">About us</Link>
                <Link to="/blog">Blog</Link>
                <Link to="/#faq">FAQ</Link>
              </div>
              <div>
                <p className="ov">Start</p>
                <Link to="/login">Get started</Link>
                <Link to="/login">Sign in</Link>
              </div>
            </div>
          </div>
          <div className="ftr-base">
            <span>© 2026 OmniContext</span>
            <span>Made on paper.</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
