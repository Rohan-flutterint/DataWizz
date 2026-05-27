import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import GridLayout, { type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { ChartRenderer } from '../components/chart-renderer'
import { Button, EmptyState, Input, Label, PageHeader, Panel, Select, Textarea } from '../components/ui'
import { api } from '../lib/api'

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

function makeWidgetId(prefix: string, count: number) {
  return `${prefix}_${Date.now()}_${count}`
}

function defaultWidgetSize(chartType?: string) {
  if (chartType === 'kpi') return { w: 3, h: 6 }
  if (chartType === 'pie' || chartType === 'donut') return { w: 4, h: 8 }
  return { w: 6, h: 8 }
}

export function DashboardBuilderPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const chartsQuery = useQuery({ queryKey: ['bi', 'charts'], queryFn: api.listCharts })
  const [name, setName] = useState('Sales Analytics Dashboard')
  const [description, setDescription] = useState('KPI cards, sales trends, and regional performance for internal stakeholders.')
  const [chartSearch, setChartSearch] = useState('')
  const [widgets, setWidgets] = useState<WidgetState[]>([])
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('Add saved charts or note widgets to the canvas, then arrange them into a polished dashboard.')

  const chartById = useMemo(() => new Map((chartsQuery.data?.items ?? []).map((chart) => [chart.id, chart])), [chartsQuery.data])

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

  useEffect(() => {
    if (!widgets.length) {
      setSelectedWidgetId(null)
      return
    }

    if (!selectedWidgetId || !widgets.some((widget) => widget.i === selectedWidgetId)) {
      setSelectedWidgetId(widgets[0].i)
    }
  }, [selectedWidgetId, widgets])

  const widgetChartQueries = useQueries({
    queries: widgets.map((widget) => {
      const chart = widget.chartId ? chartById.get(widget.chartId) : undefined
      return {
        queryKey: ['bi', 'dashboard-builder', widget.i, 'preview'],
        queryFn: () => api.previewChart({ sql: chart?.query_sql ?? 'SELECT 1 AS value', limit: 50 }),
        enabled: widget.widgetType === 'chart' && Boolean(chart?.query_sql),
      }
    }),
  })

  const dashboardMutation = useMutation({
    mutationFn: api.createDashboard,
    onSuccess: ({ dashboard }) => {
      queryClient.invalidateQueries({ queryKey: ['bi', 'dashboards'] })
      setName(dashboard.name)
      setStatusMessage(`Saved dashboard ${dashboard.name}.`)
      navigate(`/bi/dashboards?dashboardId=${encodeURIComponent(dashboard.id)}`)
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

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

  const saveDashboard = () => {
    if (!widgets.length) {
      setStatusMessage('Add at least one widget before saving the dashboard.')
      return
    }

    dashboardMutation.mutate({
      name,
      description,
      layout_json: { cols: 12, rowHeight: 28 },
      filters_json: [],
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard Design"
        title="Dashboard Builder"
        description="Compose saved charts and narrative widgets into a draggable reporting canvas, then persist a polished dashboard layout for stakeholder consumption."
        actions={
          <>
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
          <p className="mt-2 text-sm leading-6 text-slate/75">Choose saved charts from the library, add note widgets for narrative context, drag tiles into place, and save the final dashboard layout.</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate/75">
          <p className="font-semibold text-ink">Widget Types</p>
          <p className="mt-2 leading-6">Chart widgets pull from saved chart SQL. Note widgets give you space for KPI commentary and dashboard instructions.</p>
        </div>
        <div className="rounded-2xl bg-cyan-50 p-4 text-sm text-lagoon">
          <p className="font-semibold">Builder Status</p>
          <p className="mt-2 leading-6">{statusMessage}</p>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <Panel className="space-y-5">
          <div>
            <Label>Dashboard Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
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
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate/70">{widgets.length} widgets</span>
          </div>
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
                            rows={preview?.rows ?? []}
                            title={widget.title}
                            categoryKey={chart?.chart_type === 'kpi' ? undefined : String(config.dimensionKey ?? preview?.columns?.[0] ?? '')}
                            valueKey={String(config.metricAlias ?? preview?.columns?.[1] ?? '')}
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
              <div>
                <Label>Widget Type</Label>
                <Select value={selectedWidget.widgetType} disabled>
                  <option value={selectedWidget.widgetType}>{selectedWidget.widgetType}</option>
                </Select>
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
      </div>
    </div>
  )
}
