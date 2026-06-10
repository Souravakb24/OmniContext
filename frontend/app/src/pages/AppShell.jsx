import React, { useState, useEffect } from 'react'
import { useAuth } from '../AuthContext.jsx'
import Sidebar from '../components/Sidebar.jsx'
import TopBar from '../components/TopBar.jsx'
import Library from '../components/Library.jsx'
import ChatView from '../components/ChatView.jsx'
import UploadDrawer from '../components/UploadDrawer.jsx'
import MembersTable from '../components/MembersTable.jsx'
import CollectionsGrid from '../components/CollectionsGrid.jsx'
import UsageDashboard from '../components/UsageDashboard.jsx'
import Dashboard from '../components/Dashboard.jsx'

const ADMIN_VIEWS = ['members', 'collections', 'usage']

const VIEW_META = {
  dashboard:   { title: 'Dashboard',    slim: true },
  library:     { title: 'Your library', slim: false },
  members:     { title: 'Members',      slim: true,  tag: 'Admin' },
  collections: { title: 'Collections',  slim: true,  tag: 'Admin' },
  usage:       { title: 'Usage',        slim: true,  tag: 'Admin' },
}

export default function AppShell() {
  const { user } = useAuth()
  const [view, setView] = useState(() => {
    const saved = localStorage.getItem('oc_view')
    return saved && saved !== 'ask' ? saved : 'dashboard'
  })
  const [theme, setTheme] = useState(() => localStorage.getItem('oc_theme') || 'light')
  const [drawer, setDrawer] = useState(false)
  const [libraryTick, setLibraryTick] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [initialAskCollection, setInitialAskCollection] = useState(null)
  const [initialAskDoc, setInitialAskDoc] = useState(null)   // { docId, docName } | null
  const [uploadCollection, setUploadCollection] = useState(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('oc_theme', theme)
    return () => document.documentElement.removeAttribute('data-theme')
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')

  const isAdmin = user?.role === 'admin'
  const isChatView = view === 'ask'

  useEffect(() => {
    if (!isAdmin && ADMIN_VIEWS.includes(view)) setView('library')
  }, [isAdmin, view])

  const meta = VIEW_META[view] || VIEW_META.library

  const handleUploaded = () => setLibraryTick(t => t + 1)

  // Accepts optional collection name and document scope — collapses sidebar and jumps to Ask
  const handleAsk = (collectionName = null, doc = null) => {
    setInitialAskCollection(collectionName)
    setInitialAskDoc(doc)
    setSidebarCollapsed(true)
    setView('ask')
  }

  // Accepts optional collection name — opens drawer pre-selected
  const handleUpload = (collectionName = null) => {
    setUploadCollection(collectionName)
    setDrawer(true)
  }

  const handleDrawerClose = () => {
    setDrawer(false)
    setUploadCollection(null)
  }

  // When sidebar "Ask" nav item is clicked (no collection)
  const handleSetView = (v) => {
    if (v === 'ask') { handleAsk(null); return }
    localStorage.setItem('oc_view', v)
    setView(v)
    setSidebarCollapsed(false)
  }

  let body
  if (view === 'dashboard') {
    body = <Dashboard />
  } else if (view === 'library') {
    body = <Library onUpload={handleUpload} onAsk={handleAsk} refreshTick={libraryTick} />
  } else if (view === 'members') {
    body = <div className="admin-main"><MembersTable /></div>
  } else if (view === 'collections') {
    body = <div className="admin-main"><CollectionsGrid /></div>
  } else if (view === 'usage') {
    body = <div className="admin-main"><UsageDashboard /></div>
  } else {
    body = <div className="placeholder"><h2>Nothing here</h2><p>Pick a section from the sidebar.</p></div>
  }

  const sidebar = (
    <Sidebar
      view={view}
      setView={handleSetView}
      collapsed={sidebarCollapsed}
      onToggle={() => setSidebarCollapsed(c => !c)}
      theme={theme}
      onThemeToggle={toggleTheme}
    />
  )

  const drawer_el = (
    <UploadDrawer
      open={drawer}
      onClose={handleDrawerClose}
      onUploaded={handleUploaded}
      onAsk={() => handleAsk(null)}
      defaultCollection={uploadCollection}
    />
  )

  if (isChatView) {
    return (
      <>
        <div className="app" style={{ height: '100vh', overflow: 'hidden' }}>
          {sidebar}
          <div className="app-main" style={{ overflow: 'hidden', minHeight: 0 }}>
            <ChatView
              key={`${initialAskCollection || 'none'}:${initialAskDoc?.docId || 'all'}`}
              initialCollection={initialAskCollection}
              initialDoc={initialAskDoc}
            />
          </div>
        </div>
        {drawer_el}
      </>
    )
  }

  return (
    <>
      <div className="app">
        {sidebar}
        <div className="app-main">
          <TopBar title={meta.title} subtitle={meta.subtitle} slim={meta.slim} tag={meta.tag} theme={theme} onThemeToggle={toggleTheme} />
          {body}
        </div>
      </div>
      {drawer_el}
    </>
  )
}
