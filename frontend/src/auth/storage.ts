export const AUTH_STORAGE_KEY = 'datawizz_auth_session'

export function readAuthToken() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { token?: string | null }
    return parsed.token ?? null
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}
