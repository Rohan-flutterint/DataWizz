import { useQuery } from '@tanstack/react-query'
import { PageHeader, Panel } from '../components/ui'
import { api } from '../lib/api'

export function SettingsPage() {
  const { data } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="Platform Settings"
        description="Review the current local storage, object storage, and execution engine settings surfaced from the backend configuration layer."
      />

      <div className="grid gap-5 xl:grid-cols-2">
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
        </Panel>
      </div>
    </div>
  )
}
