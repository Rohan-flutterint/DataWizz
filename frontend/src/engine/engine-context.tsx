import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

const STORAGE_KEY = 'datawizz-active-engine'

type EngineContextValue = {
  activeEngineId: string
  setActiveEngineId: (engineId: string) => void
}

const EngineContext = createContext<EngineContextValue | undefined>(undefined)

function getInitialEngine() {
  if (typeof window === 'undefined') return 'duckdb'
  return window.localStorage.getItem(STORAGE_KEY) || 'duckdb'
}

export function EngineProvider({ children }: PropsWithChildren) {
  const [activeEngineId, setActiveEngineId] = useState(getInitialEngine)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, activeEngineId)
  }, [activeEngineId])

  const value = useMemo(
    () => ({
      activeEngineId,
      setActiveEngineId,
    }),
    [activeEngineId],
  )

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>
}

export function useExecutionEngine() {
  const context = useContext(EngineContext)
  if (!context) {
    throw new Error('useExecutionEngine must be used inside EngineProvider')
  }
  return context
}
