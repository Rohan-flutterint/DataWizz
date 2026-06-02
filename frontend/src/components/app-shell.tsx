import { useQuery } from '@tanstack/react-query'
import { Bell, Database, LayoutDashboard, LineChart, LogOut, Logs, PlaySquare, Search, Settings2, Sparkles, TableProperties, Workflow } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { api } from '../lib/api'
import { cn, formatDate } from '../lib/utils'

const navGroups = [
  {
    title: 'Lakehouse',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true },
      { label: 'File Explorer', to: '/files', icon: Database, end: true },
      { label: 'SQL Workspace', to: '/sql', icon: Sparkles, end: true },
      { label: 'Catalog', to: '/catalog', icon: TableProperties, end: true },
      { label: 'Pipeline Builder', to: '/pipelines', icon: Workflow, end: true },
      { label: 'Pipeline Runs', to: '/runs', icon: PlaySquare, end: true },
      { label: 'Job Logs', to: '/logs', icon: Logs, end: true },
    ],
  },
  {
    title: 'BI Layer',
    items: [
      { label: 'BI Home', to: '/bi', icon: LayoutDashboard, end: true },
      { label: 'Datasets', to: '/bi/datasets', icon: Database, end: true },
      { label: 'Chart Builder', to: '/bi/charts/new', icon: LineChart, end: true },
      { label: 'Saved Charts', to: '/bi/charts', icon: LineChart, end: true },
      { label: 'Dashboard Builder', to: '/bi/dashboards/new', icon: LayoutDashboard, end: true },
      { label: 'Dashboard Viewer', to: '/bi/dashboards', icon: TableProperties, end: true },
      { label: 'Report Scheduler', to: '/bi/reports', icon: PlaySquare, end: true },
      { label: 'Superset Setup', to: '/bi/superset', icon: Sparkles, end: true },
    ],
  },
]

function kindTone(kind: string) {
  if (kind === 'file') return 'bg-slate-100 text-slate-700'
  if (kind === 'table') return 'bg-cyan-50 text-lagoon'
  if (kind === 'pipeline') return 'bg-orange-50 text-orange-700'
  if (kind === 'dashboard') return 'bg-emerald-50 text-emerald-700'
  if (kind === 'chart') return 'bg-violet-50 text-violet-700'
  return 'bg-slate-100 text-slate-700'
}

export function AppShell() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const searchRef = useRef<HTMLDivElement | null>(null)
  const [search, setSearch] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchQuery = useQuery({
    queryKey: ['global-search', search],
    queryFn: () => api.globalSearch(search),
    enabled: search.trim().length >= 2,
  })

  const searchResults = searchQuery.data?.items ?? []
  const firstResult = useMemo(() => searchResults[0] ?? null, [searchResults])

  useEffect(() => {
    setIsSearchOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const navigateToResult = (route: string) => {
    setIsSearchOpen(false)
    setSearch('')
    navigate(route)
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[292px] flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#ff3621] font-display text-lg font-semibold text-white">D</div>
              <div>
                <p className="font-display text-xl font-semibold text-slate-950">DataWizz</p>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Lakehouse Platform</p>
              </div>
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Workspace</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">DataWizz Internal Demo</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">Databricks-inspired workspace for uploads, SQL, pipelines, and BI.</p>
            </div>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-5">
            {navGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{group.title}</p>
                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition',
                          isActive ? 'bg-[#fff1ef] text-[#c62e1a]' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
                        )
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 px-4 py-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Demo Mode</p>
              <p className="mt-2 leading-6">Local-first stack with DuckDB, Delta Lake, PostgreSQL metadata, and MinIO-ready storage paths.</p>
            </div>
            <NavLink to="/settings" className="mt-3 flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950">
              <Settings2 className="h-4 w-4" />
              Settings
            </NavLink>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="border-b border-slate-200 bg-[#111827] px-5 py-3 text-white">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="lg:hidden">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#ff3621] font-display text-lg font-semibold text-white">D</div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Workspace</p>
                  <p className="font-medium">DataWizz / Analytics Engineering</p>
                </div>
              </div>

              <div className="hidden max-w-xl flex-1 items-center justify-center md:flex">
                <div ref={searchRef} className="relative w-full max-w-xl">
                  <div className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">
                    <Search className="h-4 w-4" />
                    <input
                      value={search}
                      onFocus={() => setIsSearchOpen(true)}
                      onChange={(event) => {
                        setSearch(event.target.value)
                        setIsSearchOpen(true)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && firstResult) {
                          navigateToResult(firstResult.route)
                        }
                      }}
                      placeholder="Search files, tables, pipelines, dashboards"
                      className="w-full bg-transparent text-white placeholder:text-white/55 focus:outline-none"
                    />
                  </div>

                  {isSearchOpen && search.trim().length >= 2 ? (
                    <div className="absolute inset-x-0 top-[calc(100%+10px)] z-30 rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl">
                      {searchQuery.isLoading ? (
                        <p className="px-3 py-3 text-sm text-slate-600">Searching the workspace...</p>
                      ) : searchResults.length ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between px-3 pb-1 pt-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: '#64748b' }}>
                              Search Results
                            </p>
                            <span className="text-xs" style={{ color: '#64748b' }}>
                              {searchResults.length} matches
                            </span>
                          </div>
                          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                            {searchResults.map((result) => (
                            <button
                              key={`${result.kind}-${result.id}`}
                              type="button"
                              onClick={() => navigateToResult(result.route)}
                              className="flex w-full items-start gap-3 rounded-2xl border border-transparent bg-white px-3 py-3 text-left text-slate-900 transition hover:border-slate-200 hover:bg-slate-50"
                            >
                              <span className={`mt-0.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${kindTone(result.kind)}`}>
                                {result.kind}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold" style={{ color: '#0f172a' }}>
                                  {result.title || 'Untitled asset'}
                                </p>
                                <p className="mt-1 line-clamp-2 text-sm leading-5" style={{ color: '#475569' }}>
                                  {result.subtitle || result.route}
                                </p>
                              </div>
                              <span className="shrink-0 pl-2 text-xs uppercase tracking-[0.18em]" style={{ color: '#94a3b8' }}>
                                {formatDate(result.updated_at)}
                              </span>
                            </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="px-3 py-3 text-sm text-slate-600">No matching assets found for this search.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/80">
                  <Bell className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-white">{session?.user.name ?? 'Workspace User'}</p>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">{session?.user.role ?? 'admin'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-4 sm:px-6">
            <div className="mx-auto max-w-[1600px]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
