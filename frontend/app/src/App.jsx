import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import BlogPage from './pages/BlogPage.jsx'
import DemoPage from './pages/DemoPage.jsx'
import AppShell from './pages/AppShell.jsx'
import { AdminAuthProvider } from './admin/AdminAuthContext.jsx'
import AdminLoginPage from './admin/AdminLoginPage.jsx'
import AdminShell from './admin/AdminShell.jsx'

const PrivateRoute = ({ children }) => {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/app" element={<PrivateRoute><AppShell /></PrivateRoute>} />
        <Route path="/admin" element={<AdminLoginPage />} />
        <Route path="/admin/*" element={<AdminShell />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminAuthProvider>
  )
}
