import React, { createContext, useContext, useState, useCallback } from 'react'
import * as api from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('oc_token'))
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('oc_user')) } catch { return null }
  })

  const login = useCallback(async (org_name, username, password) => {
    const data = await api.login(org_name, username, password)
    localStorage.setItem('oc_token', data.access_token)
    const u = { username, role: data.role, org_name, org_id: data.org_id, user_id: data.user_id }
    localStorage.setItem('oc_user', JSON.stringify(u))
    setToken(data.access_token)
    setUser(u)
    return data
  }, [])

  const logout = useCallback(async () => {
    try { await api.logout() } catch {}
    localStorage.removeItem('oc_token')
    localStorage.removeItem('oc_user')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
