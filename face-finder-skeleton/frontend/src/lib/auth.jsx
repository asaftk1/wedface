export function saveToken(t) { localStorage.setItem('ff_token', t) }
export function getToken()   { return localStorage.getItem('ff_token') }
export function clearToken() { localStorage.removeItem('ff_token') }
export function authHeaders() {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}
