import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { StatusBadge } from '../components/status-badge'
import { Button, EmptyState, Input, PageHeader, Panel, Select } from '../components/ui'
import { api } from '../lib/api'
import { formatDate } from '../lib/utils'

export function JobLogsPage() {
  const [runIdFilter, setRunIdFilter] = useState('')
  const [nodeIdFilter, setNodeIdFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [statusMessage, setStatusMessage] = useState('Filter logs by pipeline run, node, and execution status to isolate failures or verify specific steps.')

  const runsQuery = useQuery({ queryKey: ['runs'], queryFn: api.listRuns })
  const logsQuery = useQuery({
    queryKey: ['logs', runIdFilter, nodeIdFilter, statusFilter],
    queryFn: () =>
      api.listLogs({
        run_id: runIdFilter || undefined,
        node_id: nodeIdFilter.trim() || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      }),
  })

  const logs = logsQuery.data?.items ?? []

  const nodeOptions = useMemo(() => {
    const ids = logs
      .map((log) => String(log.context_json?.node_id ?? '').trim())
      .filter(Boolean)
    return Array.from(new Set(ids)).sort()
  }, [logs])

  const counts = useMemo(
    () => ({
      total: logs.length,
      success: logs.filter((log) => log.status === 'success').length,
      failed: logs.filter((log) => log.status === 'failed').length,
      running: logs.filter((log) => log.status === 'running').length,
    }),
    [logs],
  )

  const resetFilters = () => {
    setRunIdFilter('')
    setNodeIdFilter('')
    setStatusFilter('all')
    setStatusMessage('Reset log filters. Showing the most recent execution events across the platform.')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Observability"
        title="Job Logs"
        description="Review execution-level messages emitted by queries and pipeline nodes, then narrow the stream by run, node, and status to debug exactly where orchestration changed."
      />

      <Panel className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Pipeline Run</p>
            <Select className="mt-3" value={runIdFilter} onChange={(event) => {
              setRunIdFilter(event.target.value)
              setStatusMessage(event.target.value ? `Filtering logs for run ${event.target.value}.` : 'Showing logs across all runs.')
            }}>
              <option value="">All runs</option>
              {runsQuery.data?.items?.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.pipeline_name || run.pipeline_id} • {run.status}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Node ID</p>
            <Input
              className="mt-3"
              list="job-log-node-options"
              value={nodeIdFilter}
              onChange={(event) => {
                setNodeIdFilter(event.target.value)
                if (event.target.value.trim()) {
                  setStatusMessage(`Filtering logs for node ${event.target.value.trim()}.`)
                }
              }}
              placeholder="fileSource_1"
            />
            <datalist id="job-log-node-options">
              {nodeOptions.map((nodeId) => (
                <option key={nodeId} value={nodeId} />
              ))}
            </datalist>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Status</p>
            <Select className="mt-3" value={statusFilter} onChange={(event) => {
              setStatusFilter(event.target.value)
              setStatusMessage(event.target.value === 'all' ? 'Showing all log statuses.' : `Filtering ${event.target.value} logs.`)
            }}>
              <option value="all">All statuses</option>
              <option value="success">success</option>
              <option value="failed">failed</option>
              <option value="running">running</option>
            </Select>
          </div>
        </div>

        <div className="rounded-2xl bg-cyan-50 p-4 text-sm text-lagoon">
          <p className="font-semibold">Filter Status</p>
          <p className="mt-2 leading-6">{statusMessage}</p>
          <Button className="mt-4" tone="ghost" onClick={resetFilters}>
            Reset Filters
          </Button>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-4">
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Visible Logs</p>
          <p className="mt-2 font-display text-3xl text-slate-950">{counts.total}</p>
        </Panel>
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Success</p>
          <p className="mt-2 font-display text-3xl text-emerald-700">{counts.success}</p>
        </Panel>
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Failed</p>
          <p className="mt-2 font-display text-3xl text-rose-700">{counts.failed}</p>
        </Panel>
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Running</p>
          <p className="mt-2 font-display text-3xl text-amber-600">{counts.running}</p>
        </Panel>
      </div>

      {logs.length ? (
        <div className="space-y-3">
          {logs.map((log) => (
            <Panel key={log.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-ink">{log.source}</p>
                  <p className="mt-2 text-sm text-slate/70">{log.message}</p>
                </div>
                <StatusBadge status={log.status ?? log.level} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {log.pipeline_run_id ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    Run {log.pipeline_run_id}
                  </span>
                ) : null}
                {log.context_json?.node_id ? (
                  <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-lagoon">
                    Node {String(log.context_json.node_id)}
                  </span>
                ) : null}
                {log.context_json?.view_name ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    View {String(log.context_json.view_name)}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.22em] text-slate/50">
                <span>{log.level}</span>
                <span>{formatDate(log.created_at)}</span>
                {log.query_id ? <span>Query {log.query_id}</span> : null}
              </div>

              {log.context_json ? (
                <div className="mt-4 rounded-2xl bg-slate-950 p-4">
                  <pre className="overflow-x-auto text-xs leading-6 text-slate-100">{JSON.stringify(log.context_json, null, 2)}</pre>
                </div>
              ) : null}
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No logs match the current filters"
          description="Try clearing one of the filters or run a pipeline again to generate fresh execution events."
        />
      )}
    </div>
  )
}
