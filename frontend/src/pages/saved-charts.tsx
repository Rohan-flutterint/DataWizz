import { useQuery } from '@tanstack/react-query'
import { PageHeader, Panel } from '../components/ui'
import { api } from '../lib/api'
import { formatDate } from '../lib/utils'

export function SavedChartsPage() {
  const chartsQuery = useQuery({ queryKey: ['bi', 'charts'], queryFn: api.listCharts })
  const datasetsQuery = useQuery({ queryKey: ['bi', 'datasets'], queryFn: api.listDatasets })

  const datasetNameById = new Map((datasetsQuery.data?.items ?? []).map((dataset) => [dataset.id, dataset.name]))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Chart Catalog"
        title="Saved Charts"
        description="Manage saved chart definitions, inspect the dataset and SQL backing each visual, and prepare assets for dashboards and scheduled reports."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {chartsQuery.data?.items?.map((chart) => {
          const config = chart.config_json as Record<string, unknown>
          return (
            <Panel key={chart.id} className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-2xl text-ink">{chart.name}</p>
                  <p className="mt-2 text-sm uppercase tracking-[0.24em] text-slate/55">{chart.chart_type}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate/70">{formatDate(chart.updated_at)}</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Semantic Dataset</p>
                  <p className="mt-2 text-sm font-semibold text-ink">
                    {(chart.dataset_id && datasetNameById.get(chart.dataset_id)) || String(config.datasetName ?? 'Not linked')}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Metric Alias</p>
                  <p className="mt-2 text-sm font-semibold text-ink">{String(config.metricAlias ?? 'Derived at runtime')}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {config.dimensionKey ? (
                  <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-lagoon">
                    Dimension: {String(config.dimensionKey)}
                  </span>
                ) : null}
                {config.rowLimit ? (
                  <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
                    Limit: {String(config.rowLimit)}
                  </span>
                ) : null}
                {config.sortDirection ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    Sort: {String(config.sortDirection)}
                  </span>
                ) : null}
              </div>

              <pre className="overflow-x-auto rounded-3xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">{chart.query_sql}</pre>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
