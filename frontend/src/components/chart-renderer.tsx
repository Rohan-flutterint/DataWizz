import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from 'recharts'
import { EmptyState, Panel } from './ui'

const palette = ['#0b7285', '#ff7a18', '#f6c453', '#2563eb', '#c2410c', '#0f766e']

function inferKeys(rows: Record<string, unknown>[]) {
  const sample = rows[0] ?? {}
  const keys = Object.keys(sample)
  return {
    categoryKey: keys[0],
    valueKey: keys[1] ?? keys[0],
  }
}

export function ChartRenderer({
  chartType,
  rows,
  title,
  categoryKey,
  valueKey,
}: {
  chartType: string
  rows: Record<string, unknown>[]
  title?: string
  categoryKey?: string
  valueKey?: string
}) {
  if (!rows.length) {
    return <EmptyState title="No chart data yet" description="Run a preview query to populate this visualization." />
  }

  const inferred = inferKeys(rows)
  const resolvedCategoryKey = categoryKey || inferred.categoryKey
  const resolvedValueKey = valueKey || inferred.valueKey
  const firstValue = rows[0]?.[resolvedValueKey]

  return (
    <Panel className="h-96">
      {title ? <h3 className="mb-4 font-display text-xl text-ink">{title}</h3> : null}
      {chartType === 'kpi' || chartType === 'number' ? (
        <div className="flex h-[320px] items-center justify-center">
          <div className="text-center">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">{resolvedValueKey}</p>
            <p className="mt-4 font-display text-6xl text-slate-950">{String(firstValue ?? '0')}</p>
          </div>
        </div>
      ) : (
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' || chartType === 'timeseries' ? (
            <LineChart data={rows}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey={resolvedCategoryKey} />
              <YAxis />
              <Tooltip />
              <Line dataKey={resolvedValueKey} stroke="#0b7285" strokeWidth={3} dot={false} />
            </LineChart>
          ) : chartType === 'area' ? (
            <AreaChart data={rows}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey={resolvedCategoryKey} />
              <YAxis />
              <Tooltip />
              <Area dataKey={resolvedValueKey} stroke="#ff7a18" fill="#ffedd5" strokeWidth={3} />
            </AreaChart>
          ) : chartType === 'pie' || chartType === 'donut' ? (
            <PieChart>
              <Tooltip />
              <Pie data={rows} dataKey={resolvedValueKey} nameKey={resolvedCategoryKey} innerRadius={chartType === 'donut' ? 72 : 0} outerRadius={112}>
                {rows.map((_, index) => (
                  <Cell key={index} fill={palette[index % palette.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={rows}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey={resolvedCategoryKey} />
              <YAxis />
              <Tooltip />
              <Bar dataKey={resolvedValueKey} fill="#0b7285" radius={[8, 8, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      )}
    </Panel>
  )
}
