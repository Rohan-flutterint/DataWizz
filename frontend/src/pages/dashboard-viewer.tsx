import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { ChartRenderer } from '../components/chart-renderer'
import { Button, EmptyState, Input, PageHeader, Panel, Select } from '../components/ui'
import { api } from '../lib/api'
import { formatDate } from '../lib/utils'

type DashboardFilterDefinition = {
  id: string
  name: string
  type: 'date_range' | 'dropdown' | 'metric'
  field: string
  appliesTo?: string
  options?: string[]
  operator?: '>=' | '>' | '=' | '<=' | '<'
  defaultValue?: string | null
  defaultStart?: string | null
  defaultEnd?: string | null
}

type DashboardFilterValue = {
  value?: string
  start?: string
  end?: string
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function escapeSqlString(value: string) {
  return value.replace(/'/g, "''")
}

function applyFiltersToSql(sql: string, filters: DashboardFilterDefinition[], filterValues: Record<string, DashboardFilterValue>, chartId?: string) {
  const clauses = filters.flatMap((filter) => {
    if (filter.appliesTo && filter.appliesTo !== 'all' && filter.appliesTo !== chartId) {
      return []
    }

    const value = filterValues[filter.id]
    const field = quoteIdentifier(filter.field)

    if (filter.type === 'dropdown' && value?.value) {
      return [`${field} = '${escapeSqlString(value.value)}'`]
    }

    if (filter.type === 'metric' && value?.value) {
      return [`TRY_CAST(${field} AS DOUBLE) ${filter.operator || '>='} ${Number(value.value) || 0}`]
    }

    if (filter.type === 'date_range') {
      const nextClauses: string[] = []
      if (value?.start) {
        nextClauses.push(`CAST(${field} AS DATE) >= DATE '${escapeSqlString(value.start)}'`)
      }
      if (value?.end) {
        nextClauses.push(`CAST(${field} AS DATE) <= DATE '${escapeSqlString(value.end)}'`)
      }
      return nextClauses
    }

    return []
  })

  if (!clauses.length) return sql
  return `SELECT * FROM (${sql}) AS dashboard_widget WHERE ${clauses.join(' AND ')}`
}

export function DashboardViewerPage() {
  const [searchParams] = useSearchParams()
  const dashboardsQuery = useQuery({ queryKey: ['bi', 'dashboards'], queryFn: api.listDashboards })
  const chartsQuery = useQuery({ queryKey: ['bi', 'charts'], queryFn: api.listCharts })
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>('')
  const [filterValues, setFilterValues] = useState<Record<string, DashboardFilterValue>>({})

  useEffect(() => {
    const requestedDashboardId = searchParams.get('dashboardId')
    if (requestedDashboardId && dashboardsQuery.data?.items?.some((dashboard) => dashboard.id === requestedDashboardId)) {
      setSelectedDashboardId(requestedDashboardId)
      return
    }
    if (!selectedDashboardId && dashboardsQuery.data?.items?.[0]) {
      setSelectedDashboardId(dashboardsQuery.data.items[0].id)
    }
  }, [dashboardsQuery.data, searchParams, selectedDashboardId])

  const detailQuery = useQuery({
    queryKey: ['bi', 'dashboards', selectedDashboardId],
    queryFn: () => api.getDashboard(selectedDashboardId),
    enabled: Boolean(selectedDashboardId),
  })

  const chartLookups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; chart_type: string; query_sql: string; config_json: Record<string, unknown> }>()
    chartsQuery.data?.items.forEach((chart) => map.set(chart.id, chart))
    return map
  }, [chartsQuery.data])

  const dashboardFilters = useMemo(
    () => ((detailQuery.data?.dashboard.filters_json as DashboardFilterDefinition[] | undefined) ?? []).map((filter) => ({ ...filter, appliesTo: filter.appliesTo ?? 'all' })),
    [detailQuery.data],
  )

  useEffect(() => {
    if (!dashboardFilters.length) {
      setFilterValues({})
      return
    }

    setFilterValues((current) => {
      const next: Record<string, DashboardFilterValue> = {}
      dashboardFilters.forEach((filter) => {
        next[filter.id] =
          current[filter.id] ??
          (filter.type === 'date_range'
            ? { start: filter.defaultStart ?? '', end: filter.defaultEnd ?? '' }
            : { value: filter.defaultValue ?? '' })
      })
      return next
    })
  }, [dashboardFilters])

  const widgetChartQueries = useQueries({
    queries:
      detailQuery.data?.widgets.map((widget) => {
        const chart = widget.chart_id ? chartLookups.get(widget.chart_id) : undefined
        const filteredSql = chart?.query_sql ? applyFiltersToSql(chart.query_sql, dashboardFilters, filterValues, widget.chart_id ?? undefined) : 'SELECT 1 AS value'
        return {
          queryKey: ['bi', 'charts', widget.id, 'preview', filteredSql],
          queryFn: () => api.previewChart({ sql: filteredSql, limit: 100 }),
          enabled: widget.widget_type === 'chart' && Boolean(chart?.query_sql),
        }
      }) ?? [],
  })

  const widgetLayout =
    detailQuery.data?.widgets.map((widget) => ({
      i: widget.layout_json.i ?? widget.id,
      x: widget.layout_json.x,
      y: widget.layout_json.y,
      w: widget.layout_json.w,
      h: widget.layout_json.h,
    })) ?? []

  const resetFilters = () => {
    const next: Record<string, DashboardFilterValue> = {}
    dashboardFilters.forEach((filter) => {
      next[filter.id] =
        filter.type === 'date_range'
          ? { start: filter.defaultStart ?? '', end: filter.defaultEnd ?? '' }
          : { value: filter.defaultValue ?? '' }
    })
    setFilterValues(next)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard Consumption"
        title="Dashboard Viewer"
        description="Open saved dashboards, apply shared dashboard-level filters, and review the final BI presentation layer with chart widgets and narrative notes."
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

      {detailQuery.data?.dashboard ? (
        <div className="space-y-5">
          <Panel className="space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Selected Dashboard</p>
                <h2 className="mt-2 font-display text-3xl text-ink">{detailQuery.data.dashboard.name}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate/70">{detailQuery.data.dashboard.description || 'No dashboard description provided yet.'}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Widgets</p>
                  <p className="mt-2 font-display text-2xl text-ink">{detailQuery.data.widgets.length}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Updated</p>
                  <p className="mt-2 text-sm font-semibold text-ink">{formatDate(detailQuery.data.dashboard.updated_at)}</p>
                </div>
              </div>
            </div>
          </Panel>

          {dashboardFilters.length ? (
            <Panel className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Dashboard Filters</p>
                  <h3 className="mt-2 font-display text-2xl text-ink">Shared Controls</h3>
                </div>
                <Button tone="ghost" onClick={resetFilters}>
                  Reset Filters
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {dashboardFilters.map((filter) => (
                  <div key={filter.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate/50">{filter.name}</p>
                    <p className="mt-1 text-sm text-slate/70">{filter.field} • {filter.type}</p>

                    {filter.type === 'dropdown' ? (
                      <Select
                        className="mt-3"
                        value={filterValues[filter.id]?.value ?? ''}
                        onChange={(event) => setFilterValues((current) => ({ ...current, [filter.id]: { value: event.target.value } }))}
                      >
                        <option value="">All values</option>
                        {(filter.options ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </Select>
                    ) : null}

                    {filter.type === 'metric' ? (
                      <div className="mt-3 space-y-2">
                        <div className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                          {filter.operator || '>='} {filter.field}
                        </div>
                        <Input
                          type="number"
                          value={filterValues[filter.id]?.value ?? ''}
                          onChange={(event) => setFilterValues((current) => ({ ...current, [filter.id]: { value: event.target.value } }))}
                          placeholder="Enter threshold"
                        />
                      </div>
                    ) : null}

                    {filter.type === 'date_range' ? (
                      <div className="mt-3 grid gap-3">
                        <Input
                          type="date"
                          value={filterValues[filter.id]?.start ?? ''}
                          onChange={(event) =>
                            setFilterValues((current) => ({
                              ...current,
                              [filter.id]: { ...current[filter.id], start: event.target.value },
                            }))
                          }
                        />
                        <Input
                          type="date"
                          value={filterValues[filter.id]?.end ?? ''}
                          onChange={(event) =>
                            setFilterValues((current) => ({
                              ...current,
                              [filter.id]: { ...current[filter.id], end: event.target.value },
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {detailQuery.data.widgets.length ? (
            <Panel className="p-0">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Dashboard Canvas</p>
                  <h3 className="font-display text-2xl text-ink">Published Layout</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate/70">Read only</span>
              </div>
              <div className="rounded-b-[28px] bg-slate-50 p-4">
                <GridLayout className="layout" layout={widgetLayout} cols={12} rowHeight={28} width={920} margin={[16, 16]} isDraggable={false} isResizable={false}>
                  {detailQuery.data.widgets.map((widget, index) => {
                    const chart = widget.chart_id ? chartLookups.get(widget.chart_id) : undefined
                    const preview = widgetChartQueries[index]?.data
                    const chartConfig = (chart?.config_json ?? {}) as Record<string, unknown>

                    return (
                      <div key={widget.layout_json.i ?? widget.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                        {widget.widget_type === 'chart' ? (
                          <div className="h-full p-4">
                            <ChartRenderer
                              chartType={chart?.chart_type ?? 'bar'}
                              rows={preview?.rows ?? []}
                              title={widget.title}
                              categoryKey={chart?.chart_type === 'kpi' ? undefined : String(chartConfig.dimensionKey ?? preview?.columns?.[0] ?? '')}
                              valueKey={String(chartConfig.metricAlias ?? preview?.columns?.[1] ?? '')}
                            />
                          </div>
                        ) : (
                          <div className="flex h-full flex-col justify-between p-5">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate/55">Note Widget</p>
                              <h3 className="mt-2 font-display text-xl text-ink">{widget.title}</h3>
                              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate/75">{String(widget.config_json.noteText ?? '')}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </GridLayout>
              </div>
            </Panel>
          ) : (
            <EmptyState title="No widgets in this dashboard" description="Open Dashboard Builder and add chart or note widgets before viewing the published dashboard." />
          )}
        </div>
      ) : (
        <EmptyState title="No dashboard selected" description="Create a dashboard in the builder and then pick it here to render its saved layout." />
      )}
    </div>
  )
}
