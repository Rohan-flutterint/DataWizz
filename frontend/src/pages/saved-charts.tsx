import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChartRenderer } from '../components/chart-renderer'
import { DataTable } from '../components/data-table'
import { Button, EmptyState, Input, Label, PageHeader, Panel, Select, Textarea } from '../components/ui'
import { api } from '../lib/api'
import { formatDate } from '../lib/utils'

export function SavedChartsPage() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const chartsQuery = useQuery({ queryKey: ['bi', 'charts'], queryFn: api.listCharts })
  const datasetsQuery = useQuery({ queryKey: ['bi', 'datasets'], queryFn: api.listDatasets })
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusMessage, setStatusMessage] = useState('Select a saved chart to inspect its SQL, dataset mapping, and live preview.')
  const [editName, setEditName] = useState('')
  const [editChartType, setEditChartType] = useState('bar')
  const [editDatasetId, setEditDatasetId] = useState('')
  const [editSql, setEditSql] = useState('')
  const [editDimensionKey, setEditDimensionKey] = useState('')
  const [editMetricAlias, setEditMetricAlias] = useState('')
  const [editRowLimit, setEditRowLimit] = useState('')
  const [editSortDirection, setEditSortDirection] = useState('desc')

  const charts = chartsQuery.data?.items ?? []
  const datasetNameById = new Map((datasetsQuery.data?.items ?? []).map((dataset) => [dataset.id, dataset.name]))
  const chartTypes = ['all', ...Array.from(new Set(charts.map((chart) => chart.chart_type))).sort()]

  const filteredCharts = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return charts.filter((chart) => {
      const config = chart.config_json as Record<string, unknown>
      const datasetName = (chart.dataset_id && datasetNameById.get(chart.dataset_id)) || String(config.datasetName ?? '')
      const matchesSearch =
        !needle ||
        chart.name.toLowerCase().includes(needle) ||
        chart.chart_type.toLowerCase().includes(needle) ||
        datasetName.toLowerCase().includes(needle)
      const matchesType = typeFilter === 'all' || chart.chart_type === typeFilter
      return matchesSearch && matchesType
    })
  }, [charts, datasetNameById, search, typeFilter])

  useEffect(() => {
    const requestedChartId = searchParams.get('chartId')
    if (requestedChartId && filteredCharts.some((chart) => chart.id === requestedChartId)) {
      setSelectedChartId(requestedChartId)
      return
    }

    if (!filteredCharts.length) {
      setSelectedChartId(null)
      return
    }

    if (!selectedChartId || !filteredCharts.some((chart) => chart.id === selectedChartId)) {
      setSelectedChartId(filteredCharts[0].id)
    }
  }, [filteredCharts, selectedChartId])

  const selectedChart = filteredCharts.find((chart) => chart.id === selectedChartId) ?? charts.find((chart) => chart.id === selectedChartId) ?? null
  const selectedConfig = (selectedChart?.config_json ?? {}) as Record<string, unknown>
  const selectedDatasetName =
    (selectedChart?.dataset_id && datasetNameById.get(selectedChart.dataset_id)) || String(selectedConfig.datasetName ?? 'Not linked')

  const previewQuery = useQuery({
    queryKey: ['bi', 'charts', 'preview', selectedChartId],
    queryFn: () => api.previewChart({ sql: selectedChart!.query_sql, limit: 200 }),
    enabled: Boolean(selectedChart),
  })

  useEffect(() => {
    if (!selectedChart) return
    setStatusMessage(`Inspecting saved chart ${selectedChart.name}.`)
    const config = (selectedChart.config_json ?? {}) as Record<string, unknown>
    setEditName(selectedChart.name)
    setEditChartType(selectedChart.chart_type)
    setEditDatasetId(selectedChart.dataset_id ?? '')
    setEditSql(selectedChart.query_sql)
    setEditDimensionKey(String(config.dimensionKey ?? ''))
    setEditMetricAlias(String(config.metricAlias ?? ''))
    setEditRowLimit(String(config.rowLimit ?? ''))
    setEditSortDirection(String(config.sortDirection ?? 'desc'))
  }, [selectedChart])

  const deleteMutation = useMutation({
    mutationFn: api.deleteChart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bi', 'charts'] })
      setStatusMessage('Chart deleted successfully.')
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })
  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; body: Record<string, unknown> }) => api.updateChart(payload.id, payload.body),
    onSuccess: (chart) => {
      queryClient.invalidateQueries({ queryKey: ['bi', 'charts'] })
      setSelectedChartId(chart.id)
      setStatusMessage(`Updated chart ${chart.name}.`)
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Chart Catalog"
        title="Saved Charts"
        description="Search, inspect, preview, and manage saved chart definitions before wiring them into dashboards or scheduled reports."
      />

      <Panel className="grid gap-4 xl:grid-cols-[1fr_0.85fr_1fr]">
        <div className="grid gap-4 md:grid-cols-[1fr_180px]">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search charts, types, or datasets" />
          <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            {chartTypes.map((type) => (
              <option key={type} value={type}>
                {type === 'all' ? 'All chart types' : type}
              </option>
            ))}
          </Select>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate/75">
          <p className="font-semibold text-ink">Library Workflow</p>
          <p className="mt-2 leading-6">Saved charts preserve the semantic dataset link, generated SQL, and visualization config that dashboards will reuse.</p>
        </div>
        <div className="rounded-2xl bg-cyan-50 p-4 text-sm text-lagoon">
          <p className="font-semibold">Library Status</p>
          <p className="mt-2 leading-6">{statusMessage}</p>
        </div>
      </Panel>

      {charts.length ? (
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Panel>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl text-ink">Chart Library</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate/65">{filteredCharts.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              {filteredCharts.map((chart) => {
                const config = chart.config_json as Record<string, unknown>
                const datasetName = (chart.dataset_id && datasetNameById.get(chart.dataset_id)) || String(config.datasetName ?? 'Not linked')
                return (
                  <button
                    key={chart.id}
                    type="button"
                    onClick={() => setSelectedChartId(chart.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedChartId === chart.id ? 'border-lagoon bg-cyan-50/70 shadow-sm' : 'border-slate-100 bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{chart.name}</p>
                        <p className="mt-1 text-sm text-slate/70">{datasetName}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/60">
                        {chart.chart_type}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate/60">
                      {config.metricAlias ? <span>Metric {String(config.metricAlias)}</span> : null}
                      {config.dimensionKey ? <span>• {String(config.dimensionKey)}</span> : null}
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate/50">{formatDate(chart.updated_at)}</p>
                  </button>
                )
              })}
              {!filteredCharts.length ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate/70">
                  No charts match the current search and chart-type filter.
                </div>
              ) : null}
            </div>
          </Panel>

          <div className="space-y-5">
            {selectedChart ? (
              <>
                <Panel className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Selected Chart</p>
                      <h2 className="mt-2 font-display text-3xl text-ink">{selectedChart.name}</h2>
                      <p className="mt-3 text-sm leading-6 text-slate/70">
                        This saved chart can be embedded into dashboards and reused across BI workflows without rebuilding the query.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-lagoon">{selectedChart.chart_type}</span>
                      <Button disabled={updateMutation.isPending} onClick={() => selectedChart && updateMutation.mutate({
                        id: selectedChart.id,
                        body: {
                          name: editName,
                          chart_type: editChartType,
                          dataset_id: editDatasetId || undefined,
                          query_sql: editSql,
                          config_json: {
                            ...selectedConfig,
                            dimensionKey: editDimensionKey || null,
                            metricAlias: editMetricAlias || null,
                            rowLimit: editRowLimit ? Number(editRowLimit) : null,
                            sortDirection: editSortDirection,
                            datasetName: editDatasetId ? datasetNameById.get(editDatasetId) : undefined,
                          },
                        },
                      })}>
                        {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button tone="danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(selectedChart.id)}>
                        {deleteMutation.isPending ? 'Deleting...' : 'Delete Chart'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Semantic Dataset</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{selectedDatasetName}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Metric Alias</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{String(selectedConfig.metricAlias ?? 'Derived')}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Updated</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{formatDate(selectedChart.updated_at)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedConfig.dimensionKey ? (
                      <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-lagoon">
                        Dimension: {String(selectedConfig.dimensionKey)}
                      </span>
                    ) : null}
                    {selectedConfig.rowLimit ? (
                      <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
                        Limit: {String(selectedConfig.rowLimit)}
                      </span>
                    ) : null}
                    {selectedConfig.sortDirection ? (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        Sort: {String(selectedConfig.sortDirection)}
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Chart Name</Label>
                      <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
                    </div>
                    <div>
                      <Label>Chart Type</Label>
                      <Select value={editChartType} onChange={(event) => setEditChartType(event.target.value)}>
                        {['bar', 'line', 'area', 'pie', 'donut', 'timeseries', 'kpi'].map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Semantic Dataset</Label>
                      <Select value={editDatasetId} onChange={(event) => setEditDatasetId(event.target.value)}>
                        <option value="">Not linked</option>
                        {datasetsQuery.data?.items?.map((dataset) => (
                          <option key={dataset.id} value={dataset.id}>
                            {dataset.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <Label>Dimension Key</Label>
                        <Input value={editDimensionKey} onChange={(event) => setEditDimensionKey(event.target.value)} />
                      </div>
                      <div>
                        <Label>Metric Alias</Label>
                        <Input value={editMetricAlias} onChange={(event) => setEditMetricAlias(event.target.value)} />
                      </div>
                      <div>
                        <Label>Row Limit</Label>
                        <Input type="number" value={editRowLimit} onChange={(event) => setEditRowLimit(event.target.value)} />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Sort Direction</Label>
                      <Select value={editSortDirection} onChange={(event) => setEditSortDirection(event.target.value)}>
                        <option value="desc">desc</option>
                        <option value="asc">asc</option>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Chart SQL</Label>
                      <Textarea rows={10} value={editSql} onChange={(event) => setEditSql(event.target.value)} />
                    </div>
                  </div>
                </Panel>

                <div className="grid gap-5 xl:grid-cols-[0.95fr_minmax(0,1.05fr)]">
                  <div className="space-y-4">
                    <ChartRenderer
                      chartType={selectedChart.chart_type}
                      rows={previewQuery.data?.rows ?? []}
                      title={selectedChart.name}
                      categoryKey={selectedChart.chart_type === 'kpi' ? undefined : String(selectedConfig.dimensionKey ?? previewQuery.data?.columns?.[0] ?? '')}
                      valueKey={String(selectedConfig.metricAlias ?? previewQuery.data?.columns?.[1] ?? '')}
                    />
                    <Panel className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Preview Result</p>
                        <h3 className="mt-2 font-display text-2xl text-ink">{previewQuery.data?.row_count ?? 0} rows</h3>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate/70">Live query preview</span>
                    </Panel>
                  </div>

                  {previewQuery.data ? (
                    <DataTable columns={previewQuery.data.columns} rows={previewQuery.data.rows} />
                  ) : (
                    <Panel>
                      <p className="text-sm text-slate/70">Preview rows will appear here after the saved chart query loads.</p>
                    </Panel>
                  )}
                </div>
              </>
            ) : (
              <EmptyState title="Select a saved chart" description="Choose a chart from the library to preview it, inspect its SQL, and manage its lifecycle." />
            )}
          </div>
        </div>
      ) : (
        <EmptyState title="No saved charts yet" description="Create a chart in Chart Builder first, then come back here to manage the saved chart library." />
      )}
    </div>
  )
}
