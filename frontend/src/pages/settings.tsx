import { useQuery } from '@tanstack/react-query'
import { MoonStar, SunMedium } from 'lucide-react'
import { PageHeader, Panel } from '../components/ui'
import { useExecutionEngine } from '../engine/engine-context'
import { api } from '../lib/api'
import { useTheme } from '../theme/theme-context'

export function SettingsPage() {
  const { data } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const engineCatalogQuery = useQuery({ queryKey: ['execution-engines'], queryFn: api.listExecutionEngines })
  const { theme, setTheme } = useTheme()
  const { activeEngineId, setActiveEngineId } = useExecutionEngine()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="Platform Settings"
        description="Review the current local storage, object storage, execution engine, and workspace appearance settings surfaced from the frontend and backend configuration layers."
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-3">
          <h2 className="font-display text-2xl text-ink">Appearance</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate/75">
            Choose whether the workspace stays in the existing light product theme or switches into the darker presentation style inspired by the login experience.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`rounded-[28px] border p-5 text-left transition ${
                theme === 'light'
                  ? 'border-[#ff3621] bg-[#fff1ef] shadow-sm'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-sm">
                    <SunMedium className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-950">Light Theme</p>
                    <p className="mt-1 text-sm text-slate-600">Current bright workspace surfaces and white panel system.</p>
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${theme === 'light' ? 'bg-[#ff3621] text-white' : 'bg-white text-slate-500'}`}>
                  {theme === 'light' ? 'Active' : 'Select'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`rounded-[28px] border p-5 text-left transition ${
                theme === 'dark'
                  ? 'border-[#f6f24a]/30 bg-[#151515] shadow-sm'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${theme === 'dark' ? 'bg-[#f6f24a] text-black' : 'bg-[#111111] text-[#f6f24a]'}`}>
                    <MoonStar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={theme === 'dark' ? 'font-semibold text-white' : 'font-semibold text-slate-950'}>Dark Theme</p>
                    <p className={theme === 'dark' ? 'mt-1 text-sm text-white/60' : 'mt-1 text-sm text-slate-600'}>
                      Dark shell, high-contrast cards, and the same black-and-yellow product mood as the login page.
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${
                    theme === 'dark' ? 'bg-[#f6f24a] text-black' : 'bg-white text-slate-500'
                  }`}
                >
                  {theme === 'dark' ? 'Active' : 'Select'}
                </span>
              </div>
            </button>
          </div>
        </Panel>

        <Panel>
          <h2 className="font-display text-2xl text-ink">Storage</h2>
          <div className="mt-4 space-y-3 text-sm text-slate/75">
            {Object.entries(data?.storage ?? {}).map(([key, value]) => (
              <div key={key} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">{key}</p>
                <p className="mt-2 text-ink">{String(value)}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h2 className="font-display text-2xl text-ink">Execution</h2>
          <div className="mt-4 space-y-3 text-sm text-slate/75">
            {Object.entries(data?.execution ?? {}).map(([key, value]) => (
              <div key={key} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">{key}</p>
                <p className="mt-2 text-ink">{String(value)}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Notebook engine selection</p>
            {engineCatalogQuery.data?.items?.map((engine) => (
              <button
                key={engine.id}
                type="button"
                onClick={() => setActiveEngineId(engine.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  activeEngineId === engine.id
                    ? theme === 'dark'
                      ? 'border-[#f6f24a]/35 bg-[#181818]'
                      : 'border-[#ff3621] bg-[#fff1ef]'
                    : theme === 'dark'
                      ? 'border-white/10 bg-white/[0.03] hover:border-white/20'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-ink">{engine.label}</p>
                    <p className="mt-1 text-sm text-slate/75">{engine.summary}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${
                      engine.available
                        ? theme === 'dark'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-emerald-100 text-emerald-700'
                        : theme === 'dark'
                          ? 'bg-orange-500/15 text-orange-300'
                          : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    {activeEngineId === engine.id ? 'Active' : engine.status.replace(/_/g, ' ')}
                  </span>
                </div>
                {!engine.available && engine.availability_reason ? <p className="mt-2 text-sm text-slate/75">{engine.availability_reason}</p> : null}
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
