import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { api } from '../lib/api'
import type { AuthSession } from '../types'

const STORAGE_KEY = 'datawizz_auth_session'

type AuthContextValue = {
  session: AuthSession | null
  isAuthenticated: boolean
  login: (payload: { email: string; password: string }) => Promise<AuthSession>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null)

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      setSession(JSON.parse(raw) as AuthSession)
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session),
      login: async (payload) => {
        const nextSession = await api.demoLogin(payload)
        setSession(nextSession)
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession))
        return nextSession
      },
      logout: () => {
        setSession(null)
        window.localStorage.removeItem(STORAGE_KEY)
      },
    }),
    [session],
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
