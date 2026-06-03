import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { api } from '../lib/api'
import type { AuthSession } from '../types'
import { AUTH_STORAGE_KEY } from './storage'

type AuthContextValue = {
  session: AuthSession | null
  isAuthenticated: boolean
  isReady: boolean
  login: (payload: { email: string; password: string }) => Promise<AuthSession>
  logout: () => Promise<void>
  hasAnyRole: (...roles: string[]) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      setIsReady(true)
      return
    }
    let parsed: AuthSession | null = null
    try {
      parsed = JSON.parse(raw) as AuthSession
      setSession(parsed)
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      setIsReady(true)
      return
    }
    void api
      .getCurrentSessionUser()
      .then((user) => {
        const nextSession = parsed ? { ...parsed, user } : null
        if (nextSession) {
          setSession(nextSession)
          window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
        }
      })
      .catch(() => {
        setSession(null)
        window.localStorage.removeItem(AUTH_STORAGE_KEY)
      })
      .finally(() => setIsReady(true))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session),
      isReady,
      login: async (payload) => {
        const nextSession = await api.login(payload)
        setSession(nextSession)
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
        return nextSession
      },
      logout: async () => {
        try {
          await api.logout()
        } catch {
          // local cleanup still wins if the session is already invalid
        }
        setSession(null)
        window.localStorage.removeItem(AUTH_STORAGE_KEY)
      },
      hasAnyRole: (...roles) => roles.some((role) => session?.user.role?.toLowerCase() === role.toLowerCase()),
    }),
    [isReady, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
