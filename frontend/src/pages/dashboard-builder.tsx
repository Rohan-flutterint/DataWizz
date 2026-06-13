import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import GridLayout, { type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useAuth } from '../auth/auth-context'
import { ChartRenderer } from '../components/chart-renderer'
import { Button, EmptyState, Input, Label, PageHeader, Panel, Select, Textarea } from '../components/ui'
import { api } from '../lib/api'
import { getChartSnapshot } from '../lib/chart-handoff'

type WidgetState = {
  i: string
  x: number
  y: number
  w: number
  h: number
  title: string
  widgetType: 'chart' | 'note'
  chartId?: string
  noteText?: string
}

type DashboardFilterState = {
  id: string
  name: string
  type: 'date_range' | 'dropdown' | 'metric'
  field: string
  appliesTo: 'all' | string
  optionsText: string
  operator: '>=' | '>' | '=' | '<=' | '<'
  defaultValue: string
  defaultStart: string
  defaultEnd: string
}

function makeWidgetId(prefix: string, count: number) {
  return `${prefix}_${Date.now()}_${count}`
}

function makeFilterId(count: number) {
  return `dashboard_filter_${Date.now()}_${count}`
}

function defaultWidgetSize(chartType?: string) {
  if (chartType === 'kpi') return { w: 3, h: 6 }
  if (chartType === 'pie' || chartType === 'donut') return { w: 4, h: 8 }
  return { w: 6, h: 8 }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.URL.revokeObjectURL(url)
}

export function DashboardBuilderPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const chartsQuery = useQuery({ queryKey: ['bi', 'charts'], queryFn: api.listCharts })
  const dashboardsQuery = useQuery({ queryKey: ['bi', 'dashboards'], queryFn: api.listDashboards })
  const [name, setName] = useState('Sales Analytics Dashboard')
  const [description, setDescription] = useState('KPI cards, sales trends, and regional performance for internal stakeholders.')
  const [editingDashboardId, setEditingDashboardId] = useState('')
  const [chartSearch, setChartSearch] = useState('')
  const [widgets, setWidgets] = useState<WidgetState[]>([])
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [filters, setFilters] = useState<DashboardFilterState[]>([])
  const [selectedFilterId, setSelectedFilterId] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<'private' | 'workspace' | 'public'>('workspace')
  const [sharedRoles, setSharedRoles] = useState<string[]>(['admin', 'analyst', 'viewer'])
  const [statusMessage, setStatusMessage] = useState('Add saved charts or note widgets to the canvas, then define dashboard-level filters before saving.')

  const chartById = useMemo(() => new Map((chartsQuery.data?.items ?? []).map((chart) => [chart.id, chart])), [chartsQuery.data])
  const dashboardDetailQuery = useQuery({
    queryKey: ['bi', 'dashboards', 'builder', editingDashboardId],
    queryFn: () => api.getDashboard(editingDashboardId),
    enabled: Boolean(editingDashboardId),
  })

  const filteredCharts = useMemo(() => {
    const needle = chartSearch.trim().toLowerCase()
    return (chartsQuery.data?.items ?? []).filter((chart) => {
      if (!needle) return true
      return chart.name.toLowerCase().includes(needle) || chart.chart_type.toLowerCase().includes(needle)
    })
  }, [chartSearch, chartsQuery.data])

  const widgetLayout = useMemo<Layout[]>(
    () => widgets.map((widget) => ({ i: widget.i, x: widget.x, y: widget.y, w: widget.w, h: widget.h })),
    [widgets],
  )

  const selectedWidget = widgets.find((widget) => widget.i === selectedWidgetId) ?? null
  const selectedFilter = filters.find((filter) => filter.id === selectedFilterId) ?? null

  useEffect(() => {
    if (!widgets.length) {
      setSelectedWidgetId(null)
      return
    }

    if (!selectedWidgetId || !widgets.some((widget) => widget.i === selectedWidgetId)) {
      setSelectedWidgetId(widgets[0].i)
    }
  }, [selectedWidgetId, widgets])

  useEffect(() => {
    if (!filters.length) {
      setSelectedFilterId(null)
      return
    }

    if (!selectedFilterId || !filters.some((filter) => filter.id === selectedFilterId)) {
      setSelectedFilterId(filters[0].id)
    }
  }, [filters, selectedFilterId])

  const widgetChartQueries = useQueries({
    queries: widgets.map((widget) => {
      const chart = widget.chartId ? chartById.get(widget.chartId) : undefined
      const chartSnapshot = getChartSnapshot((chart?.config_json ?? {}) as Record<string, unknown>)
      return {
        queryKey: ['bi', 'dashboard-builder', widget.i, 'preview'],
        queryFn: () => api.previewChart({ sql: chart?.query_sql ?? 'SELECT 1 AS value', limit: 50 }),
        enabled: widget.widgetType === 'chart' && Boolean(chart?.query_sql) && !chartSnapshot,
      }
    }),
  })

  const resetBuilderState = () => {
    setEditingDashboardId('')
    setName('Sales Analytics Dashboard')
    setDescription('KPI cards, sales trends, and regional performance for internal stakeholders.')
    setWidgets([])
    setFilters([])
    setSelectedWidgetId(null)
    setSelectedFilterId(null)
    setVisibility('workspace')
    setSharedRoles(['admin', 'analyst', 'viewer'])
    setStatusMessage('Add saved charts or note widgets to the canvas, then define dashboard-level filters before saving.')
  }

  useEffect(() => {
    if (!editingDashboardId || !dashboardDetailQuery.data) return
    setName(dashboardDetailQuery.data.dashboard.name)
    setDescription(dashboardDetailQuery.data.dashboard.description ?? '')
    setVisibility(dashboardDetailQuery.data.dashboard.visibility ?? 'workspace')
    setSharedRoles(dashboardDetailQuery.data.dashboard.shared_roles_json?.length ? dashboardDetailQuery.data.dashboard.shared_roles_json : ['admin', 'analyst', 'viewer'])
    setWidgets(
      dashboardDetailQuery.data.widgets.map((widget) => ({
        i: widget.layout_json.i ?? widget.id,
        x: widget.layout_json.x,
        y: widget.layout_json.y,
        w: widget.layout_json.w,
        h: widget.layout_json.h,
        title: widget.title,
        widgetType: widget.widget_type as 'chart' | 'note',
        chartId: widget.chart_id ?? undefined,
        noteText: String(widget.config_json.noteText ?? ''),
      })),
    )
    setFilters(
      (((dashboardDetailQuery.data.dashboard.filters_json as Record<string, unknown>[] | undefined) ?? []).map((filter) => ({
        id: String(filter.id ?? makeFilterId(1)),
        name: String(filter.name ?? 'Dashboard Filter'),
        type: (filter.type as DashboardFilterState['type']) ?? 'dropdown',
        field: String(filter.field ?? 'dimension'),
        appliesTo: String(filter.appliesTo ?? 'all'),
        optionsText: Array.isArray(filter.options) ? filter.options.map((option) => String(option)).join(', ') : '',
        operator: (filter.operator as DashboardFilterState['operator']) ?? '>=',
        defaultValue: String(filter.defaultValue ?? ''),
        defaultStart: String(filter.defaultStart ?? ''),
        defaultEnd: String(filter.defaultEnd ?? ''),
      })) as DashboardFilterState[]),
    )
    setStatusMessage(`Editing dashboard ${dashboardDetailQuery.data.dashboard.name}.`)
  }, [dashboardDetailQuery.data, editingDashboardId])

  const dashboardMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      editingDashboardId ? api.updateDashboard(editingDashboardId, payload) : api.createDashboard(payload),
    onSuccess: ({ dashboard }) => {
      queryClient.invalidateQueries({ queryKey: ['bi', 'dashboards'] })
      setEditingDashboardId(dashboard.id)
      setName(dashboard.name)
      setStatusMessage(`${editingDashboardId ? 'Updated' : 'Saved'} dashboard ${dashboard.name}.`)
      navigate(`/bi/dashboards?dashboardId=${encodeURIComponent(dashboard.id)}`)
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  const importDashboardMutation = useMutation({
    mutationFn: api.importDashboard,
    onSuccess: ({ dashboard, imported_charts }) => {
      queryClient.invalidateQueries({ queryKey: ['bi', 'dashboards'] })
      queryClient.invalidateQueries({ queryKey: ['bi', 'charts'] })
      setEditingDashboardId(dashboard.id)
      setStatusMessage(
        imported_charts.length
          ? `Imported dashboard ${dashboard.name} with ${imported_charts.length} linked chart definitions.`
          : `Imported dashboard ${dashboard.name}.`,
      )
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  const buildDraftExport = () => ({
    version: '1.0',
    exported_at: new Date().toISOString(),
    dashboard: {
      name,
      description,
      layout_json: { cols: 12, rowHeight: 28 },
      filters_json: filters.map((filter) => ({
        id: filter.id,
        name: filter.name,
        type: filter.type,
        field: filter.field,
        appliesTo: filter.appliesTo,
        options: filter.optionsText
          .split(',')
          .map((option) => option.trim())
          .filter(Boolean),
        operator: filter.operator,
        defaultValue: filter.defaultValue || null,
        defaultStart: filter.defaultStart || null,
        defaultEnd: filter.defaultEnd || null,
      })),
      visibility,
      shared_roles_json: visibility === 'workspace' ? sharedRoles : [],
    },
    widgets: widgets.map((widget) => ({
      widget_type: widget.widgetType,
      title: widget.title,
      layout_json: { i: widget.i, x: widget.x, y: widget.y, w: widget.w, h: widget.h },
      config_json: widget.widgetType === 'note' ? { noteText: widget.noteText } : {},
      chart_source_id: widget.widgetType === 'chart' ? widget.chartId : undefined,
    })),
    charts: widgets
      .filter((widget) => widget.widgetType === 'chart' && widget.chartId)
      .map((widget) => chartById.get(widget.chartId ?? ''))
      .filter((chart): chart is NonNullable<typeof chart> => Boolean(chart))
      .reduce<Array<{ source_chart_id: string; name: string; chart_type: string; dataset_id?: string; query_sql: string; config_json: Record<string, unknown> }>>((accumulator, chart) => {
        if (accumulator.some((item) => item.source_chart_id === chart.id)) return accumulator
        accumulator.push({
          source_chart_id: chart.id,
          name: chart.name,
          chart_type: chart.chart_type,
          dataset_id: chart.dataset_id,
          query_sql: chart.query_sql,
          config_json: chart.config_json,
        })
        return accumulator
      }, []),
  })

  const exportDraft = () => {
    const blob = new Blob([JSON.stringify(buildDraftExport(), null, 2)], { type: 'application/json' })
    downloadBlob(blob, `${name.trim().toLowerCase().replace(/\s+/g, '_') || 'dashboard'}.draft.dashboard.json`)
    setStatusMessage(`Exported draft JSON for ${name}.`)
  }

  const importDashboardFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      importDashboardMutation.mutate({ config: JSON.parse(text) })
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to import dashboard JSON.')
    } finally {
      event.target.value = ''
    }
  }

  const addChartWidget = (chartId: string) => {
    const chart = chartById.get(chartId)
    if (!chart) return
    const size = defaultWidgetSize(chart.chart_type)
    const nextId = makeWidgetId('chart_widget', widgets.length + 1)
    setWidgets((current) => [
      ...current,
      {
        i: nextId,
        x: (current.length * 3) % 12,
        y: current.length * 8,
        w: size.w,
        h: size.h,
        title: chart.name,
        widgetType: 'chart',
        chartId: chart.id,
      },
    ])
    setSelectedWidgetId(nextId)
    setStatusMessage(`Added ${chart.name} to the dashboard canvas.`)
  }

  const addNoteWidget = () => {
    const nextId = makeWidgetId('note_widget', widgets.length + 1)
    setWidgets((current) => [
      ...current,
      {
        i: nextId,
        x: (current.length * 3) % 12,
        y: current.length * 8,
        w: 4,
        h: 6,
        title: 'Narrative Note',
        widgetType: 'note',
        noteText: 'Add KPI context, business commentary, or usage notes for stakeholders here.',
      },
    ])
    setSelectedWidgetId(nextId)
    setStatusMessage('Added a note widget to the dashboard canvas.')
  }

  const addFilter = (type: DashboardFilterState['type']) => {
    const nextId = makeFilterId(filters.length + 1)
    const nextFilter: DashboardFilterState = {
      id: nextId,
      name:
        type === 'date_range'
          ? 'Date Range Filter'
          : type === 'dropdown'
            ? 'Dropdown Filter'
            : 'Metric Threshold',
      type,
      field: type === 'metric' ? 'amount_sum' : 'dimension',
      appliesTo: 'all',
      optionsText: type === 'dropdown' ? 'West, East, North, South' : '',
      operator: '>=',
      defaultValue: type === 'dropdown' ? 'West' : type === 'metric' ? '1000' : '',
      defaultStart: '',
      defaultEnd: '',
    }
    setFilters((current) => [...current, nextFilter])
    setSelectedFilterId(nextId)
    setStatusMessage(`Added ${nextFilter.name} to the dashboard filter bar.`)
  }

  const saveDashboard = () => {
    if (!widgets.length) {
      setStatusMessage('Add at least one widget before saving the dashboard.')
      return
    }

    dashboardMutation.mutate({
      name,
      description,
      layout_json: { cols: 12, rowHeight: 28 },
      filters_json: filters.map((filter) => ({
        id: filter.id,
        name: filter.name,
        type: filter.type,
        field: filter.field,
        appliesTo: filter.appliesTo,
        options: filter.optionsText
          .split(',')
          .map((option) => option.trim())
          .filter(Boolean),
        operator: filter.operator,
        defaultValue: filter.defaultValue || null,
        defaultStart: filter.defaultStart || null,
        defaultEnd: filter.defaultEnd || null,
      })),
      visibility,
      shared_roles_json: visibility === 'workspace' ? sharedRoles : [],
      widgets: widgets.map((widget) => ({
        chart_id: widget.widgetType === 'chart' ? widget.chartId : undefined,
        widget_type: widget.widgetType,
        title: widget.title,
        layout_json: { i: widget.i, x: widget.x, y: widget.y, w: widget.w, h: widget.h },
        config_json: widget.widgetType === 'note' ? { noteText: widget.noteText } : {},
      })),
    })
  }

  const updateSelectedWidget = (patch: Partial<WidgetState>) => {
    if (!selectedWidget) return
    setWidgets((current) => current.map((widget) => (widget.i === selectedWidget.i ? { ...widget, ...patch } : widget)))
  }

  const updateSelectedFilter = (patch: Partial<DashboardFilterState>) => {
    if (!selectedFilter) return
    setFilters((current) => current.map((filter) => (filter.id === selectedFilter.id ? { ...filter, ...patch } : filter)))
  }

  const toggleSharedRole = (role: string) => {
    setSharedRoles((current) => {
      if (current.includes(role)) {
        const next = current.filter((item) => item !== role)
        return next.length ? next : ['admin', 'analyst', 'viewer']
      }
      return [...current, role]
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard Design"
        title="Dashboard Builder"
        description="Compose saved charts and narrative widgets into a draggable reporting canvas, then define shared dashboard filters that can affect multiple widgets."
        actions={
          <>
            <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={importDashboardFile} />
            <Button tone="ghost" onClick={() => importInputRef.current?.click()}>
              Import Dashboard JSON
            </Button>
            <Button tone="ghost" onClick={exportDraft}>
              Export Draft JSON
            </Button>
            <Button tone="ghost" onClick={addNoteWidget}>
              Add Note Widget
            </Button>
            <Button disabled={dashboardMutation.isPending} onClick={saveDashboard}>
              {dashboardMutation.isPending ? 'Saving...' : 'Save Dashboard'}
            </Button>
          </>
        }
      />

      <Panel className="grid gap-4 xl:grid-cols-[1fr_0.85fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Builder Flow</p>
          <p className="mt-2 text-sm leading-6 text-slate/75">Add saved charts to the canvas, create dashboard-level filters like date ranges or dropdowns, and save a BI surface that feels closer to a real analytics product.</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate/75">
          <p className="font-semibold text-ink">Config Portability</p>
          <p className="mt-2 leading-6">Dashboard filters apply to all widgets by default. You can also scope a filter to a single saved chart if needed.</p>
          <p className="mt-2 leading-6">Use import/export JSON to move dashboards between demos, keep JSON snapshots in git, or hand off curated draft layouts internally.</p>
        </div>
        <div className="rounded-2xl bg-cyan-50 p-4 text-sm text-lagoon">
          <p className="font-semibold">Builder Status</p>
          <p className="mt-2 leading-6">{statusMessage}</p>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        <Panel className="space-y-5">
          <div>
            <Label>Edit Existing Dashboard</Label>
            <Select
              value={editingDashboardId}
              onChange={(event) => {
                const nextId = event.target.value
                setEditingDashboardId(nextId)
                if (!nextId) {
                  resetBuilderState()
                }
              }}
            >
              <option value="">New dashboard</option>
              {dashboardsQuery.data?.items?.map((dashboard) => (
                <option key={dashboard.id} value={dashboard.id}>
                  {dashboard.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Dashboard Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <Label>Sharing & Access</Label>
            <Select className="mt-3" value={visibility} onChange={(event) => setVisibility(event.target.value as 'private' | 'workspace' | 'public')}>
              <option value="private">Private to owner + admins</option>
              <option value="workspace">Workspace role access</option>
              <option value="public">All signed-in users</option>
            </Select>
            <p className="mt-3 text-sm leading-6 text-slate/70">
              Owner: <span className="font-semibold text-ink">{dashboardDetailQuery.data?.dashboard.owner_email || session?.user.email || 'Current signed-in user'}</span>
            </p>
            {visibility === 'workspace' ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate/55">Allowed roles</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { role: 'viewer', label: 'Viewer' },
                    { role: 'analyst', label: 'Analyst' },
                    { role: 'admin', label: 'Admin' },
                  ].map((entry) => {
                    const active = sharedRoles.includes(entry.role)
                    return (
                      <button
                        key={entry.role}
                        type="button"
                        onClick={() => toggleSharedRole(entry.role)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                          active ? 'bg-cyan-100 text-lagoon ring-1 ring-lagoon/20' : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-900'
                        }`}
                      >
                        {entry.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs leading-5 text-slate/60">Pick which signed-in roles can discover and open this dashboard from the viewer, report scheduler, and global search.</p>
              </div>
            ) : null}
          </div>
          <div>
            <Label>Saved Charts</Label>
            <Input className="mt-3" value={chartSearch} onChange={(event) => setChartSearch(event.target.value)} placeholder="Search chart library" />
            <div className="mt-3 space-y-2">
              {filteredCharts.length ? (
                filteredCharts.map((chart) => (
                  <button
                    key={chart.id}
                    type="button"
                    className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-slate-300"
                    onClick={() => addChartWidget(chart.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{chart.name}</p>
                        <p className="mt-1 text-sm text-slate/70">{chart.chart_type}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/60">
                        Add
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate/70">
                  Create saved charts first, then add them to the dashboard here.
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Dashboard Filters</Label>
              <div className="flex gap-2">
                <Button tone="ghost" className="px-3 py-2 text-xs" onClick={() => addFilter('date_range')}>
                  Date
                </Button>
                <Button tone="ghost" className="px-3 py-2 text-xs" onClick={() => addFilter('dropdown')}>
                  Dropdown
                </Button>
                <Button tone="ghost" className="px-3 py-2 text-xs" onClick={() => addFilter('metric')}>
                  Metric
                </Button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {filters.length ? (
                filters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setSelectedFilterId(filter.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedFilterId === filter.id ? 'border-lagoon bg-cyan-50/70 shadow-sm' : 'border-slate-100 bg-slate-50/80'
                    }`}
                  >
                    <p className="font-semibold text-ink">{filter.name}</p>
                    <p className="mt-1 text-sm text-slate/70">{filter.type} • {filter.field}</p>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate/70">
                  No dashboard filters yet. Add one so viewers can slice all relevant widgets together.
                </div>
              )}
            </div>
          </div>

          <Button tone="ghost" onClick={addNoteWidget}>
            Add Note Widget
          </Button>
        </Panel>

        <Panel className="space-y-4 p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Canvas Preview</p>
              <h2 className="font-display text-2xl text-ink">Dashboard Layout</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate/70">{widgets.length} widgets</span>
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-lagoon">
                {visibility === 'public' ? 'public' : visibility === 'private' ? 'private' : 'workspace'}
              </span>
            </div>
          </div>
          {filters.length ? (
            <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50 px-5 py-4">
              {filters.map((filter) => (
                <span key={filter.id} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700">
                  {filter.name}
                </span>
              ))}
            </div>
          ) : null}
          {widgets.length ? (
            <div className="rounded-b-[28px] bg-slate-50 p-4">
              <GridLayout
                className="layout"
                layout={widgetLayout}
                cols={12}
                rowHeight={28}
                width={920}
                margin={[16, 16]}
                onLayoutChange={(nextLayout) =>
                  setWidgets((current) =>
                    current.map((widget) => {
                      const item = nextLayout.find((layoutItem) => layoutItem.i === widget.i)
                      return item ? { ...widget, x: item.x, y: item.y, w: item.w, h: item.h } : widget
                    }),
                  )
                }
              >
                {widgets.map((widget, index) => {
                  const chart = widget.chartId ? chartById.get(widget.chartId) : undefined
                  const preview = widgetChartQueries[index]?.data
                  const config = (chart?.config_json ?? {}) as Record<string, unknown>
                  const chartSnapshot = getChartSnapshot(config)

                  return (
                    <div
                      key={widget.i}
                      className={`overflow-hidden rounded-3xl border bg-white shadow-sm ${
                        selectedWidgetId === widget.i ? 'border-lagoon ring-2 ring-cyan-100' : 'border-slate-200'
                      }`}
                      onClick={() => setSelectedWidgetId(widget.i)}
                    >
                      {widget.widgetType === 'chart' ? (
                        <div className="h-full p-4">
                          <ChartRenderer
                            chartType={chart?.chart_type ?? 'bar'}
                            rows={chartSnapshot?.rows ?? preview?.rows ?? []}
                            title={widget.title}
                            categoryKey={
                              chart?.chart_type === 'kpi'
                                ? undefined
                                : String(config.dimensionKey ?? chartSnapshot?.columns?.[0] ?? preview?.columns?.[0] ?? '')
                            }
                            valueKey={String(config.metricAlias ?? chartSnapshot?.columns?.[1] ?? preview?.columns?.[1] ?? '')}
                            config={config}
                          />
                        </div>
                      ) : (
                        <div className="flex h-full flex-col justify-between p-5">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate/55">Note Widget</p>
                            <h3 className="mt-2 font-display text-xl text-ink">{widget.title}</h3>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate/75">{widget.noteText}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </GridLayout>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState title="Canvas is empty" description="Add a saved chart or note widget from the side panel to begin composing the dashboard." />
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Widget Inspector</p>
                <h3 className="font-display text-2xl text-ink">{selectedWidget?.title || 'Select a widget'}</h3>
              </div>
              {selectedWidget ? (
                <Button
                  tone="danger"
                  onClick={() => {
                    setWidgets((current) => current.filter((widget) => widget.i !== selectedWidget.i))
                    setSelectedWidgetId(null)
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </div>

            {selectedWidget ? (
              <>
                <div>
                  <Label>Widget Title</Label>
                  <Input value={selectedWidget.title} onChange={(event) => updateSelectedWidget({ title: event.target.value })} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Width</Label>
                    <Input type="number" min={2} max={12} value={String(selectedWidget.w)} onChange={(event) => updateSelectedWidget({ w: Number(event.target.value || selectedWidget.w) })} />
                  </div>
                  <div>
                    <Label>Height</Label>
                    <Input type="number" min={4} max={16} value={String(selectedWidget.h)} onChange={(event) => updateSelectedWidget({ h: Number(event.target.value || selectedWidget.h) })} />
                  </div>
                </div>

                {selectedWidget.widgetType === 'chart' ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate/75">
                    <p className="font-semibold text-ink">Linked Chart</p>
                    <p className="mt-2 leading-6">{chartById.get(selectedWidget.chartId ?? '')?.name || 'This chart is missing or was removed from the library.'}</p>
                  </div>
                ) : (
                  <div>
                    <Label>Note Text</Label>
                    <Textarea rows={8} value={selectedWidget.noteText ?? ''} onChange={(event) => updateSelectedWidget({ noteText: event.target.value })} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate/70">Click a tile in the canvas to rename it, resize it, or remove it before saving the dashboard.</p>
            )}
          </Panel>

          <Panel className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Filter Inspector</p>
                <h3 className="font-display text-2xl text-ink">{selectedFilter?.name || 'Select a filter'}</h3>
              </div>
              {selectedFilter ? (
                <Button
                  tone="danger"
                  onClick={() => {
                    setFilters((current) => current.filter((filter) => filter.id !== selectedFilter.id))
                    setSelectedFilterId(null)
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </div>

            {selectedFilter ? (
              <>
                <div>
                  <Label>Filter Name</Label>
                  <Input value={selectedFilter.name} onChange={(event) => updateSelectedFilter({ name: event.target.value })} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Filter Type</Label>
                    <Select
                      value={selectedFilter.type}
                      onChange={(event) =>
                        updateSelectedFilter({
                          type: event.target.value as DashboardFilterState['type'],
                        })
                      }
                    >
                      <option value="date_range">date_range</option>
                      <option value="dropdown">dropdown</option>
                      <option value="metric">metric</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Applies To</Label>
                    <Select value={selectedFilter.appliesTo} onChange={(event) => updateSelectedFilter({ appliesTo: event.target.value })}>
                      <option value="all">all widgets</option>
                      {widgets
                        .filter((widget) => widget.widgetType === 'chart' && widget.chartId)
                        .map((widget) => (
                          <option key={widget.i} value={widget.chartId}>
                            {widget.title}
                          </option>
                        ))}
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Field Name</Label>
                  <Input value={selectedFilter.field} onChange={(event) => updateSelectedFilter({ field: event.target.value })} placeholder="dimension or order_date" />
                </div>

                {selectedFilter.type === 'dropdown' ? (
                  <>
                    <div>
                      <Label>Dropdown Options</Label>
                      <Input value={selectedFilter.optionsText} onChange={(event) => updateSelectedFilter({ optionsText: event.target.value })} placeholder="West, East, North, South" />
                    </div>
                    <div>
                      <Label>Default Value</Label>
                      <Input value={selectedFilter.defaultValue} onChange={(event) => updateSelectedFilter({ defaultValue: event.target.value })} placeholder="West" />
                    </div>
                  </>
                ) : null}

                {selectedFilter.type === 'metric' ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Operator</Label>
                      <Select value={selectedFilter.operator} onChange={(event) => updateSelectedFilter({ operator: event.target.value as DashboardFilterState['operator'] })}>
                        <option value=">=">{'>='}</option>
                        <option value=">">{'>'}</option>
                        <option value="=">{'='}</option>
                        <option value="<=">{'<='}</option>
                        <option value="<">{'<'}</option>
                      </Select>
                    </div>
                    <div>
                      <Label>Default Threshold</Label>
                      <Input value={selectedFilter.defaultValue} onChange={(event) => updateSelectedFilter({ defaultValue: event.target.value })} placeholder="1000" />
                    </div>
                  </div>
                ) : null}

                {selectedFilter.type === 'date_range' ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Default Start</Label>
                      <Input type="date" value={selectedFilter.defaultStart} onChange={(event) => updateSelectedFilter({ defaultStart: event.target.value })} />
                    </div>
                    <div>
                      <Label>Default End</Label>
                      <Input type="date" value={selectedFilter.defaultEnd} onChange={(event) => updateSelectedFilter({ defaultEnd: event.target.value })} />
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate/75">
                  <p className="font-semibold text-ink">Authoring Tip</p>
                  <p className="mt-2 leading-6">Use chart output column names like `dimension`, `order_date`, or metric aliases such as `amount_sum` so one dashboard filter can affect multiple widgets consistently.</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate/70">Add a dashboard filter from the left panel, then configure its field, type, and scope here.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
