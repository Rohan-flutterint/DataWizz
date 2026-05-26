import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { ChartRenderer } from '../components/chart-renderer'
import { DataTable } from '../components/data-table'
import { MonacoSqlEditor } from '../components/monaco-sql-editor'
import { Button, EmptyState, Input, Label, PageHeader, Panel, Select } from '../components/ui'
import { api } from '../lib/api'

type MetricOption = {
  key: string
  label: string
  expression: string
  alias: string
}

type DimensionOption = {
  key: string
  label: string
}

const chartTypes = ['bar', 'line', 'area', 'pie', 'donut', 'timeseries', 'kpi'] as const

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function inferDimensions(schema: { name: string; type: string }[] = [], datasetDimensions: Record<string, unknown>[] = []): DimensionOption[] {
  if (datasetDimensions.length) {
    return datasetDimensions.map((dimension) => ({
      key: String(dimension.name ?? dimension.label ?? ''),
      label: String(dimension.label ?? dimension.name ?? ''),
    }))
  }

  return schema.map((field) => ({
    key: field.name,
    label: field.name,
  }))
}

function inferMetrics(schema: { name: string; type: string }[] = [], datasetMetrics: Record<string, unknown>[] = []): MetricOption[] {
  const semanticMetrics = datasetMetrics
    .filter((metric) => metric && typeof metric === 'object')
    .map((metric) => {
      const name = String(metric.name ?? 'metric_value')
      return {
        key: `semantic:${name}`,
        label: name,
        expression: String(metric.expression ?? name),
        alias: name.replace(/[^a-z0-9_]+/gi, '_').toLowerCase(),
      }
    })

  const numericMetrics = schema
    .filter((field) => /(int|float|double|decimal|bigint|numeric)/i.test(field.type))
    .map((field) => ({
      key: `sum:${field.name}`,
      label: `SUM(${field.name})`,
      expression: `SUM(${quoteIdentifier(field.name)})`,
      alias: `${field.name}_sum`,
    }))

  return [...semanticMetrics, ...numericMetrics]
}

function buildChartSql({
  sourceRef,
  chartType,
  dimension,
  metric,
  rowLimit,
  sortDirection,
}: {
  sourceRef: string
  chartType: string
  dimension?: string
  metric: MetricOption
  rowLimit: number
  sortDirection: 'asc' | 'desc'
}) {
  const safeSource = quoteIdentifier(sourceRef)
  const safeLimit = Number.isFinite(rowLimit) && rowLimit > 0 ? rowLimit : 10

  if (chartType === 'kpi') {
    return `SELECT ${metric.expression} AS ${quoteIdentifier(metric.alias)}\nFROM ${safeSource}`
  }

  const dimensionExpr = dimension ? quoteIdentifier(dimension) : quoteIdentifier('category')
  const orderBy = chartType === 'timeseries' ? '1 ASC' : `2 ${sortDirection.toUpperCase()}`

  return `SELECT ${dimensionExpr} AS "dimension", ${metric.expression} AS ${quoteIdentifier(metric.alias)}\nFROM ${safeSource}\nGROUP BY 1\nORDER BY ${orderBy}\nLIMIT ${safeLimit}`
}

export function ChartBuilderPage() {
  const queryClient = useQueryClient()
  const datasetsQuery = useQuery({ queryKey: ['bi', 'datasets'], queryFn: api.listDatasets })
  const [name, setName] = useState('Revenue by Region')
  const [chartType, setChartType] = useState<(typeof chartTypes)[number]>('bar')
  const [datasetId, setDatasetId] = useState('')
  const [dimensionKey, setDimensionKey] = useState('')
  const [metricKey, setMetricKey] = useState('')
  const [rowLimit, setRowLimit] = useState('12')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [sql, setSql] = useState('')
  const [statusMessage, setStatusMessage] = useState('Choose a semantic dataset, pick a dimension and metric, then generate a chart query.')

  const selectedDataset = useMemo(
    () => datasetsQuery.data?.items.find((dataset) => dataset.id === datasetId) ?? null,
    [datasetId, datasetsQuery.data],
  )

  const dimensionOptions = useMemo(
    () => inferDimensions(selectedDataset?.schema_json ?? [], (selectedDataset?.dimensions_json as Record<string, unknown>[] | undefined) ?? []),
    [selectedDataset],
  )

  const metricOptions = useMemo(
    () => inferMetrics(selectedDataset?.schema_json ?? [], (selectedDataset?.metrics_json as Record<string, unknown>[] | undefined) ?? []),
    [selectedDataset],
  )

  const selectedMetric = metricOptions.find((metric) => metric.key === metricKey) ?? null

  useEffect(() => {
    const firstDataset = datasetsQuery.data?.items[0]
    if (!datasetId && firstDataset) {
      setDatasetId(firstDataset.id)
    }
  }, [datasetId, datasetsQuery.data])

  useEffect(() => {
    if (!selectedDataset) return
    if (!dimensionOptions.find((dimension) => dimension.key === dimensionKey)) {
      setDimensionKey(dimensionOptions[0]?.key ?? '')
    }
    if (!metricOptions.find((metric) => metric.key === metricKey)) {
      setMetricKey(metricOptions[0]?.key ?? '')
    }
    setStatusMessage(`Modeling chart SQL from semantic dataset ${selectedDataset.name}.`)
  }, [dimensionKey, dimensionOptions, metricKey, metricOptions, selectedDataset])

  useEffect(() => {
    if (!selectedDataset || !selectedMetric) return
    const defaultName =
      chartType === 'kpi'
        ? `${selectedMetric.alias.replace(/_/g, ' ')} KPI`
        : `${selectedMetric.alias.replace(/_/g, ' ')} by ${dimensionKey || 'dimension'}`
    setName((current) => (current.trim() ? current : defaultName))
  }, [chartType, dimensionKey, selectedDataset, selectedMetric])

  const previewMutation = useMutation({
    mutationFn: api.previewChart,
    onSuccess: (data) => {
      setStatusMessage(`Preview returned ${data.row_count} rows for ${name}.`)
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  const saveMutation = useMutation({
    mutationFn: api.createChart,
    onSuccess: (chart) => {
      queryClient.invalidateQueries({ queryKey: ['bi', 'charts'] })
      setName(chart.name)
      setStatusMessage(`Saved chart ${chart.name}.`)
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  const generateSql = () => {
    if (!selectedDataset || !selectedMetric) {
      setStatusMessage('Select a semantic dataset and metric before generating chart SQL.')
      return
    }

    if (chartType !== 'kpi' && !dimensionKey) {
      setStatusMessage('Choose a dimension for categorical or trend charts.')
      return
    }

    const nextSql = buildChartSql({
      sourceRef: selectedDataset.source_ref,
      chartType,
      dimension: chartType === 'kpi' ? undefined : dimensionKey,
      metric: selectedMetric,
      rowLimit: Number(rowLimit),
      sortDirection,
    })
    setSql(nextSql)
    setStatusMessage(`Generated SQL for ${selectedDataset.name}. You can preview it or keep editing manually.`)
  }

  const previewRows = previewMutation.data?.rows ?? []
  const previewColumns = previewMutation.data?.columns ?? []
  const previewValueKey = selectedMetric?.alias || previewColumns[1]

  const saveChart = () => {
    if (!sql.trim()) {
      setStatusMessage('Generate or enter chart SQL before saving.')
      return
    }

    saveMutation.mutate({
      name,
      chart_type: chartType,
      dataset_id: datasetId || undefined,
      query_sql: sql,
      config_json: {
        chartType,
        datasetName: selectedDataset?.name,
        sourceRef: selectedDataset?.source_ref,
        dimensionKey: chartType === 'kpi' ? null : dimensionKey,
        metricKey,
        metricAlias: selectedMetric?.alias,
        sortDirection,
        rowLimit: Number(rowLimit),
      },
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Visual Analytics"
        title="Chart Builder"
        description="Build charts from semantic datasets with guided field selection, auto-generated SQL, live chart previews, and saveable metadata for dashboards."
      />

      <Panel className="grid gap-4 xl:grid-cols-[1fr_0.9fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Chart Setup</p>
          <p className="mt-2 text-sm leading-6 text-slate/75">Pick a semantic dataset, choose the dimension and metric you want to visualize, and generate the query that will power the chart.</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate/75">
          <p className="font-semibold text-ink">Supported Types</p>
          <p className="mt-2 leading-6">Bar, line, area, pie, donut, timeseries, and KPI visuals are supported in the first BI build.</p>
        </div>
        <div className="rounded-2xl bg-cyan-50 p-4 text-sm text-lagoon">
          <p className="font-semibold">Builder Status</p>
          <p className="mt-2 leading-6">{statusMessage}</p>
        </div>
      </Panel>

      {datasetsQuery.data?.items?.length ? (
        <div className="grid gap-5 xl:grid-cols-[1.15fr_minmax(0,1fr)]">
          <div className="space-y-5">
            <Panel className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Chart Name</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Revenue by Region" />
                </div>
                <div>
                  <Label>Chart Type</Label>
                  <Select value={chartType} onChange={(event) => setChartType(event.target.value as (typeof chartTypes)[number])}>
                    {chartTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Semantic Dataset</Label>
                  <Select value={datasetId} onChange={(event) => setDatasetId(event.target.value)}>
                    <option value="">Select a dataset</option>
                    {datasetsQuery.data?.items.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Metric</Label>
                  <Select value={metricKey} onChange={(event) => setMetricKey(event.target.value)} disabled={!metricOptions.length}>
                    <option value="">Select a metric</option>
                    {metricOptions.map((metric) => (
                      <option key={metric.key} value={metric.key}>
                        {metric.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>{chartType === 'kpi' ? 'Dimension' : 'Group By Dimension'}</Label>
                  <Select value={dimensionKey} onChange={(event) => setDimensionKey(event.target.value)} disabled={chartType === 'kpi' || !dimensionOptions.length}>
                    <option value="">{chartType === 'kpi' ? 'Not needed for KPI' : 'Select a dimension'}</option>
                    {dimensionOptions.map((dimension) => (
                      <option key={dimension.key} value={dimension.key}>
                        {dimension.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Sort</Label>
                    <Select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')} disabled={chartType === 'timeseries' || chartType === 'kpi'}>
                      <option value="desc">desc</option>
                      <option value="asc">asc</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Row Limit</Label>
                    <Input value={rowLimit} onChange={(event) => setRowLimit(event.target.value)} type="number" min={1} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button tone="ghost" onClick={generateSql}>
                  Generate Guided SQL
                </Button>
                <Button disabled={previewMutation.isPending} onClick={() => previewMutation.mutate({ sql, limit: 200 })}>
                  {previewMutation.isPending ? 'Previewing...' : 'Preview Chart'}
                </Button>
                <Button tone="secondary" disabled={saveMutation.isPending} onClick={saveChart}>
                  {saveMutation.isPending ? 'Saving...' : 'Save Chart'}
                </Button>
              </div>
            </Panel>

            <Panel className="space-y-4 p-0">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Chart SQL</p>
                  <h2 className="font-display text-2xl text-ink">Generated Query</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate/70">
                  {selectedDataset?.source_ref || 'No source selected'}
                </span>
              </div>
              <MonacoSqlEditor value={sql} onChange={setSql} height={300} />
            </Panel>

            {previewColumns.length ? <DataTable columns={previewColumns} rows={previewRows} /> : null}
          </div>

          <div className="space-y-5">
            <Panel className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Dataset Context</p>
                  <h2 className="mt-2 font-display text-2xl text-ink">{selectedDataset?.name || 'Select a dataset'}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate/70">{selectedDataset?.description || 'Semantic dataset metadata and reusable metrics will appear here.'}</p>
                </div>
                <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-lagoon">
                  {selectedDataset?.source_ref || 'BI'}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Columns</p>
                  <p className="mt-2 font-display text-2xl text-ink">{selectedDataset?.schema_json?.length ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Dimensions</p>
                  <p className="mt-2 font-display text-2xl text-ink">{dimensionOptions.length}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Metrics</p>
                  <p className="mt-2 font-display text-2xl text-ink">{metricOptions.length}</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Dimensions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {dimensionOptions.map((dimension) => (
                      <span key={dimension.key} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {dimension.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Metrics</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {metricOptions.map((metric) => (
                      <span key={metric.key} className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
                        {metric.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>

            <ChartRenderer
              chartType={chartType}
              rows={previewRows}
              title={name}
              categoryKey={chartType === 'kpi' ? undefined : previewColumns[0]}
              valueKey={previewValueKey}
            />
          </div>
        </div>
      ) : (
        <EmptyState
          title="No semantic datasets yet"
          description="Create a semantic dataset in Dataset Explorer first, then come back here to build charts from reusable business-friendly fields."
        />
      )}
    </div>
  )
}
