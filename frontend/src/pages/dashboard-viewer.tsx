import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { ChartRenderer } from '../components/chart-renderer'
import { EmptyState, PageHeader, Panel, Select } from '../components/ui'
import { api } from '../lib/api'

export function DashboardViewerPage() {
  const dashboardsQuery = useQuery({ queryKey: ['bi', 'dashboards'], queryFn: api.listDashboards })
  const chartsQuery = useQuery({ queryKey: ['bi', 'charts'], queryFn: api.listCharts })
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>('')

  useEffect(() => {
    if (!selectedDashboardId && dashboardsQuery.data?.items?.[0]) {
      setSelectedDashboardId(dashboardsQuery.data.items[0].id)
    }
  }, [dashboardsQuery.data, selectedDashboardId])

  const detailQuery = useQuery({
    queryKey: ['bi', 'dashboards', selectedDashboardId],
    queryFn: () => api.getDashboard(selectedDashboardId),
    enabled: Boolean(selectedDashboardId),
  })

  const chartLookups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; chart_type: string; query_sql: string }>()
    chartsQuery.data?.items.forEach((chart) => map.set(chart.id, chart))
    return map
  }, [chartsQuery.data])

  const widgetChartQueries = useQueries({
    queries:
      detailQuery.data?.widgets.map((widget) => {
        const chart = widget.chart_id ? chartLookups.get(widget.chart_id) : undefined
        return {
          queryKey: ['bi', 'charts', widget.id, 'preview'],
          queryFn: () => api.previewChart({ sql: chart?.query_sql ?? 'SELECT 1 AS value', limit: 200 }),
          enabled: Boolean(chart?.query_sql),
        }
      }) ?? [],
  })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard Consumption"
        title="Dashboard Viewer"
        description="Open saved dashboards, hydrate widgets from saved chart SQL, and inspect the BI presentation layer of the platform."
      />

      <Panel className="max-w-md">
        <Select value={selectedDashboardId} onChange={(event) => setSelectedDashboardId(event.target.value)}>
          <option value="">Select a dashboard</option>
          {dashboardsQuery.data?.items?.map((dashboard) => (
            <option key={dashboard.id} value={dashboard.id}>
              {dashboard.name}
            </option>
          ))}
        </Select>
      </Panel>

      {detailQuery.data?.widgets?.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {detailQuery.data.widgets.map((widget, index) => {
            const chart = widget.chart_id ? chartLookups.get(widget.chart_id) : undefined
            const preview = widgetChartQueries[index]?.data
            return (
              <ChartRenderer
                key={widget.id}
                chartType={chart?.chart_type ?? 'bar'}
                rows={preview?.rows ?? []}
                title={widget.title}
              />
            )
          })}
        </div>
      ) : (
        <EmptyState title="No dashboard selected" description="Create a dashboard in the builder and then pick it here to render its saved widgets." />
      )}
    </div>
  )
}
