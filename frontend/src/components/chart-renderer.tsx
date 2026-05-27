import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Label as RechartsLabel,
  Legend,
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

function coerceNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function formatValue(value: unknown, format: string) {
  const numericValue = coerceNumber(value)
  if (numericValue === null) return String(value ?? '')

  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(numericValue)
  }
  if (format === 'percent') {
    return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(numericValue)
  }
  if (format === 'compact') {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(numericValue)
  }
  if (format === 'integer') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(numericValue)
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(numericValue)
}

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
  config,
}: {
  chartType: string
  rows: Record<string, unknown>[]
  title?: string
  categoryKey?: string
  valueKey?: string
  config?: Record<string, unknown>
}) {
  if (!rows.length) {
    return <EmptyState title="No chart data yet" description="Run a preview query to populate this visualization." />
  }

  const inferred = inferKeys(rows)
  const resolvedCategoryKey = categoryKey || String(config?.dimensionKey ?? inferred.categoryKey)
  const resolvedValueKey = valueKey || String(config?.metricAlias ?? inferred.valueKey)
  const color = String(config?.color ?? '#0b7285')
  const fillColor = String(config?.fillColor ?? `${color}22`)
  const xAxisLabel = String(config?.xAxisLabel ?? '')
  const yAxisLabel = String(config?.yAxisLabel ?? '')
  const numberFormat = String(config?.numberFormat ?? 'number')
  const showLegend = Boolean(config?.showLegend ?? false)
  const kpiSubtitle = String(config?.kpiSubtitle ?? resolvedValueKey)
  const kpiThresholdValue = coerceNumber(config?.kpiThresholdValue)
  const kpiThresholdDirection = String(config?.kpiThresholdDirection ?? '>=')
  const resolvedPiePalette = [color, ...palette.filter((item) => item !== color)]
  const firstValue = rows[0]?.[resolvedValueKey]
  const numericFirstValue = coerceNumber(firstValue)
  const thresholdMet =
    numericFirstValue !== null && kpiThresholdValue !== null
      ? kpiThresholdDirection === '>='
        ? numericFirstValue >= kpiThresholdValue
        : numericFirstValue <= kpiThresholdValue
      : null
  const tooltipFormatter = (value: unknown) => formatValue(value, numberFormat)
  const yAxisTickFormatter = (value: unknown) => formatValue(value, numberFormat)

  return (
    <Panel className="h-96">
      {title ? <h3 className="mb-4 font-display text-xl text-ink">{title}</h3> : null}
      {chartType === 'kpi' || chartType === 'number' ? (
        <div className="flex h-[320px] items-center justify-center">
          <div className="text-center">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">{kpiSubtitle}</p>
            <p className="mt-4 font-display text-6xl text-slate-950">{formatValue(firstValue ?? 0, numberFormat)}</p>
            {kpiThresholdValue !== null ? (
              <div
                className={`mt-5 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  thresholdMet === null ? 'bg-slate-100 text-slate-700' : thresholdMet ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                Target {kpiThresholdDirection} {formatValue(kpiThresholdValue, numberFormat)}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' || chartType === 'timeseries' ? (
            <LineChart data={rows}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey={resolvedCategoryKey}>
                {xAxisLabel ? <RechartsLabel value={xAxisLabel} offset={-6} position="insideBottom" /> : null}
              </XAxis>
              <YAxis tickFormatter={yAxisTickFormatter}>
                {yAxisLabel ? <RechartsLabel angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} value={yAxisLabel} /> : null}
              </YAxis>
              <Tooltip formatter={tooltipFormatter} />
              {showLegend ? <Legend /> : null}
              <Line dataKey={resolvedValueKey} name={title || resolvedValueKey} stroke={color} strokeWidth={3} dot={false} />
            </LineChart>
          ) : chartType === 'area' ? (
            <AreaChart data={rows}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey={resolvedCategoryKey}>
                {xAxisLabel ? <RechartsLabel value={xAxisLabel} offset={-6} position="insideBottom" /> : null}
              </XAxis>
              <YAxis tickFormatter={yAxisTickFormatter}>
                {yAxisLabel ? <RechartsLabel angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} value={yAxisLabel} /> : null}
              </YAxis>
              <Tooltip formatter={tooltipFormatter} />
              {showLegend ? <Legend /> : null}
              <Area dataKey={resolvedValueKey} name={title || resolvedValueKey} stroke={color} fill={fillColor} strokeWidth={3} />
            </AreaChart>
          ) : chartType === 'pie' || chartType === 'donut' ? (
            <PieChart>
              <Tooltip formatter={tooltipFormatter} />
              {showLegend ? <Legend /> : null}
              <Pie data={rows} dataKey={resolvedValueKey} nameKey={resolvedCategoryKey} innerRadius={chartType === 'donut' ? 72 : 0} outerRadius={112}>
                {rows.map((_, index) => (
                  <Cell key={index} fill={resolvedPiePalette[index % resolvedPiePalette.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={rows}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey={resolvedCategoryKey}>
                {xAxisLabel ? <RechartsLabel value={xAxisLabel} offset={-6} position="insideBottom" /> : null}
              </XAxis>
              <YAxis tickFormatter={yAxisTickFormatter}>
                {yAxisLabel ? <RechartsLabel angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} value={yAxisLabel} /> : null}
              </YAxis>
              <Tooltip formatter={tooltipFormatter} />
              {showLegend ? <Legend /> : null}
              <Bar dataKey={resolvedValueKey} name={title || resolvedValueKey} fill={color} radius={[8, 8, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      )}
    </Panel>
  )
}
