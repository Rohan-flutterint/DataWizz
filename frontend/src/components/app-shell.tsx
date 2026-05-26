import { Bell, Database, LayoutDashboard, LineChart, Logs, PlaySquare, Search, Settings2, Sparkles, TableProperties, Workflow } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '../lib/utils'

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

export function AppShell() {
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
                <div className="flex w-full max-w-xl items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75">
                  <Search className="h-4 w-4" />
                  <span>Search files, tables, pipelines, dashboards</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/80">
                  <Bell className="h-4 w-4" />
                </button>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium">Demo Admin</div>
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
