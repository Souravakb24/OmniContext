const BASE = '/api/super_admin'

function getSAToken() {
  return localStorage.getItem('sa_token')
}

async function saReq(method, path, body) {
  const token = getSAToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let msg = `${res.status}`
    try { const d = await res.json(); msg = d.detail || d.message || msg } catch {}
    const err = new Error(msg)
    err.status = res.status
    throw err
  }

  if (res.status === 204) return null
  return res.json()
}

// Auth
export const saLogin = (username, password) =>
  saReq('POST', '/login', { username, password })

// Platform stats
export const saStats = () => saReq('GET', '/stats')

// Org management
export const saOrgs = () => saReq('GET', '/orgs')
export const saOrgUsers = (org_id) => saReq('GET', `/org/${org_id}/users`)
export const saUpdateLimits = (org_id, max_users, max_collections, max_docs_per_collection) =>
  saReq('PATCH', `/org/${org_id}/limits`, { max_users, max_collections, max_docs_per_collection })
export const saUpdateConsent = (org_id, data_consent, allow_training) =>
  saReq('PATCH', `/org/${org_id}/consent`, { data_consent, allow_training })

// Logs — summary
export const saLogsSummary = () => saReq('GET', '/logs/summary')

// Logs — ingestion
export const saLogsIngestion = (params = {}) => {
  const q = new URLSearchParams()
  if (params.page)          q.set('page',          params.page)
  if (params.limit)         q.set('limit',         params.limit)
  if (params.status)        q.set('status',        params.status)
  if (params.collection_id) q.set('collection_id', params.collection_id)
  if (params.from_dt)       q.set('from_dt',       params.from_dt)
  if (params.to_dt)         q.set('to_dt',         params.to_dt)
  return saReq('GET', `/logs/ingestion?${q}`)
}
export const saLogsIngestionTrace = (doc_id) =>
  saReq('GET', `/logs/ingestion/${doc_id}/trace`)

// Logs — queries
export const saLogsQueries = (params = {}) => {
  const q = new URLSearchParams()
  if (params.page)       q.set('page',       params.page)
  if (params.limit)      q.set('limit',      params.limit)
  if (params.status)     q.set('status',     params.status)
  if (params.session_id) q.set('session_id', params.session_id)
  if (params.from_dt)    q.set('from_dt',    params.from_dt)
  if (params.to_dt)      q.set('to_dt',      params.to_dt)
  return saReq('GET', `/logs/queries?${q}`)
}
export const saLogsQueryTrace = (query_id) =>
  saReq('GET', `/logs/queries/${query_id}/trace`)

// Logs — tokens
export const saLogsTokens = (group_by = 'stage', from_dt, to_dt) => {
  const q = new URLSearchParams({ group_by })
  if (from_dt) q.set('from_dt', from_dt)
  if (to_dt)   q.set('to_dt',   to_dt)
  return saReq('GET', `/logs/tokens?${q}`)
}

// Logs — errors
export const saLogsErrors = (params = {}) => {
  const q = new URLSearchParams()
  if (params.page)    q.set('page',    params.page)
  if (params.limit)   q.set('limit',   params.limit)
  if (params.from_dt) q.set('from_dt', params.from_dt)
  if (params.to_dt)   q.set('to_dt',   params.to_dt)
  return saReq('GET', `/logs/errors?${q}`)
}
export const saLogsErrorsGrouped = () => saReq('GET', '/logs/errors/grouped')

// Logs — store health
export const saLogsStoreHealth = () => saReq('GET', '/logs/store-health')

// Logs — sessions (conversations)
export const saLogsSessions = (params = {}) => {
  const q = new URLSearchParams()
  if (params.page)  q.set('page',  params.page)
  if (params.limit) q.set('limit', params.limit)
  return saReq('GET', `/logs/sessions?${q}`)
}
export const saLogsSessionDetail = (session_id) =>
  saReq('GET', `/logs/sessions/${session_id}`)
