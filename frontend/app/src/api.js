const BASE = '/api'

function getToken() {
  return localStorage.getItem('oc_token')
}

async function req(method, path, body, isForm = false) {
  const token = getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!isForm) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let msg = `${res.status}`
    try { const d = await res.json(); msg = d.detail || d.error || d.message || msg } catch {}
    const err = new Error(msg)
    err.status = res.status
    throw err
  }

  if (res.status === 204) return null
  return res.json()
}

// Auth
export const login = (org_name, username, password) =>
  req('POST', '/auth/login', { org_name, username, password })

export const logout = () => req('POST', '/auth/logout')

// Orgs
export const listOrgs = () => req('GET', '/orgs')

export const registerOrg = (org_name, max_users, max_collections, max_docs_per_collection) =>
  req('POST', '/org/register', { org_name, max_users, max_collections, max_docs_per_collection })

export const registerUser = (org_name, username, password) =>
  req('POST', '/org/user/register', { org_name, username, password })

// Me
export const getMe = () => req('GET', '/user/me')

export const changePassword = (old_password, new_password) =>
  req('POST', '/user/change-password', { old_password, new_password })

// Collections
export const getMyCollections = () => req('GET', '/org/my/collections')
export const getAdminCollections = () => req('GET', '/org/collections')
export const getUploadCollections = () => req('GET', '/org/upload/collections')
export const createCollection = (name, description) =>
  req('POST', '/org/collection/create', { name, description })

// Documents
export const getMyDocuments = () => req('GET', '/user/documents')

export const getDocStatus = (doc_id) => req('GET', `/user/document/${doc_id}/status`)

export const getDocSummary = (doc_id) => req('GET', `/user/document/${doc_id}/summary`)

export const getDashboard = () => req('GET', '/user/dashboard')

export const retryDocument = (doc_id) => req('POST', `/user/document/${doc_id}/retry`)

export const deleteDocument = (doc_id) => req('DELETE', `/user/document/${doc_id}`)
export const deleteDocuments = (doc_ids) => req('DELETE', '/user/documents', { doc_ids })
export const updateDocumentTags = (doc_id, tags) => req('PATCH', `/user/document/${doc_id}/tags`, { tags })

export const uploadFiles = (files, collection_name, tags, storage_mode) => {
  const fd = new FormData()
  files.forEach(f => fd.append('files', f))
  fd.append('collection_name', collection_name)
  if (tags && tags.length) tags.forEach(t => fd.append('tags', t))
  fd.append('is_db', storage_mode || 'Vector_DB')
  return req('POST', '/user/upload', fd, true)
}

// Retrieval / Chat
export const listConversations = () => req('GET', '/v1/retrieval/conversations')

export const getConversationHistory = (session_id, page = 1, page_size = 10) =>
  req('GET', `/v1/retrieval/conversations/${session_id}/history?page=${page}&page_size=${page_size}`)

export async function sendQuery(raw_query, collection_name, session_id, is_graph, onEvent, doc_id = null) {
  const token = getToken()
  const res = await fetch(`${BASE}/v1/retrieval/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ raw_query, collection_name, session_id: session_id || undefined, is_graph, doc_id: doc_id || undefined }),
  })

  if (!res.ok) {
    let msg = `${res.status}`
    try { const d = await res.json(); msg = d.detail || d.error || msg } catch {}
    const err = new Error(msg); err.status = res.status; throw err
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop()
    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith('data: ')) continue
      try { onEvent(JSON.parse(line.slice(6))) } catch {}
    }
  }
}

// Evidence (PDF viewer)
export const getEvidence = (chunk_id) => req('GET', `/evidence/${chunk_id}`)

// Collections (admin)
export const deleteCollection = (collection_id) => req('DELETE', `/org/collection/${collection_id}`)
export const renameCollection = (collection_id, name) => req('PATCH', `/org/collection/${collection_id}/rename`, { name })
export const updateCollectionDescription = (collection_id, description) => req('PATCH', `/org/collection/${collection_id}/description`, { description })

// Conversations
export const deleteConversation = (session_id) => req('DELETE', `/v1/retrieval/conversations/${session_id}`)
export const deleteAllConversations = () => req('DELETE', '/v1/retrieval/conversations')
export const renameConversation = (session_id, title) => req('PATCH', `/v1/retrieval/conversations/${session_id}/rename`, { title })

// Org admin
export const getOrgUsers = () => req('GET', '/org/users')
export const getOrgStats = () => req('GET', '/org/stats')
export const promoteUser = (username) => req('PATCH', '/org/user/promote', { username })
export const demoteUser = (username) => req('PATCH', '/org/user/demote', { username })
export const activateUser = (username) => req('PATCH', '/org/user/activate', { username })
export const deactivateUser = (username) => req('PATCH', '/org/user/deactivate', { username })
export const deleteUser = (username) => req('DELETE', `/org/user/${username}`)
