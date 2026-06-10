import React, { createContext, useContext, useState, useCallback } from 'react'
import { saLogin } from './adminApi.js'

const AdminAuthContext = createContext(null)

export function AdminAuthProvider({ children }) {
  const [saToken, setSaToken] = useState(() => localStorage.getItem('sa_token'))
  const [saUser,  setSaUser]  = useState(() => localStorage.getItem('sa_username'))

  const login = useCallback(async (username, password) => {
    const data = await saLogin(username, password)
    localStorage.setItem('sa_token',    data.access_token)
    localStorage.setItem('sa_username', username)
    setSaToken(data.access_token)
    setSaUser(username)
    return data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('sa_token')
    localStorage.removeItem('sa_username')
    setSaToken(null)
    setSaUser(null)
  }, [])

  return (
    <AdminAuthContext.Provider value={{ saToken, saUser, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export const useAdminAuth = () => useContext(AdminAuthContext)
