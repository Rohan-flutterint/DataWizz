import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { Button, Input, Label, PageHeader, Panel, Textarea } from '../components/ui'
import { api } from '../lib/api'

type WidgetState = {
  i: string
  x: number
  y: number
  w: number
  h: number
  title: string
  chartId?: string
}

export function DashboardBuilderPage() {
  const queryClient = useQueryClient()
  const chartsQuery = useQuery({ queryKey: ['bi', 'charts'], queryFn: api.listCharts })
  const [name, setName] = useState('Sales Analytics Dashboard')
  const [description, setDescription] = useState('KPI cards and curated sales trends for internal stakeholders.')
  const [widgets, setWidgets] = useState<WidgetState[]>([])

  const dashboardMutation = useMutation({
    mutationFn: api.createDashboard,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bi', 'dashboards'] }),
  })

  const layout = useMemo(
    () => widgets.map((widget) => ({ i: widget.i, x: widget.x, y: widget.y, w: widget.w, h: widget.h })),
    [widgets],
  )

  const addWidget = (chartId: string, chartName: string, chartType: string, index: number) => {
    setWidgets((current) => [
      ...current,
      {
        i: chartId,
        x: (index * 4) % 12,
        y: current.length * 8,
        w: chartType === 'pie' ? 4 : 6,
        h: 8,
        title: chartName,
        chartId,
      },
    ])
  }

  const saveDashboard = () => {
    dashboardMutation.mutate({
      name,
      description,
      layout_json: { cols: 12 },
      widgets: widgets.map((widget) => ({
        chart_id: widget.chartId,
        widget_type: 'chart',
        title: widget.title,
        layout_json: { i: widget.i, x: widget.x, y: widget.y, w: widget.w, h: widget.h },
        config_json: {},
      })),
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard Design"
        title="Dashboard Builder"
        description="Assemble saved charts into a drag-and-drop reporting canvas, then persist a shareable dashboard layout as JSON-backed metadata."
      />

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="space-y-4">
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
            <div className="mt-3 space-y-2">
              {chartsQuery.data?.items?.map((chart, index) => (
                <button
                  key={chart.id}
                  type="button"
                  className="w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left"
                  onClick={() => addWidget(chart.id, chart.name, chart.chart_type, index)}
                >
                  <p className="font-semibold text-ink">{chart.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate/50">{chart.chart_type}</p>
                </button>
              ))}
            </div>
          </div>
          <Button onClick={saveDashboard}>Save Dashboard</Button>
        </Panel>

        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Canvas Preview</p>
          <div className="mt-4 rounded-[28px] bg-slate-50 p-4">
            <GridLayout
              className="layout"
              layout={layout}
              cols={12}
              rowHeight={28}
              width={900}
              onLayoutChange={(nextLayout) =>
                setWidgets((current) =>
                  current.map((widget) => {
                    const item = nextLayout.find((layoutItem) => layoutItem.i === widget.i)
                    return item ? { ...widget, x: item.x, y: item.y, w: item.w, h: item.h } : widget
                  }),
                )
              }
            >
              {widgets.map((widget) => (
                <div key={widget.i} className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate/55">Widget</p>
                  <h3 className="mt-2 font-display text-xl text-ink">{widget.title}</h3>
                  <p className="mt-2 text-sm text-slate/70">Resize and reposition this tile to shape the final dashboard layout.</p>
                </div>
              ))}
            </GridLayout>
          </div>
        </Panel>
      </div>
    </div>
  )
}
