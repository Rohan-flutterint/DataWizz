import { useQuery } from '@tanstack/react-query'
import { StatusBadge } from '../components/status-badge'
import { EmptyState, PageHeader, Panel } from '../components/ui'
import { api } from '../lib/api'
import { formatDate } from '../lib/utils'

export function JobLogsPage() {
  const { data } = useQuery({ queryKey: ['logs'], queryFn: api.listLogs })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Observability"
        title="Job Logs"
        description="Review execution-level messages emitted by queries and pipeline nodes, including validation failures and Delta publication events."
      />

      {data?.items?.length ? (
        <div className="space-y-3">
          {data.items.map((log) => (
            <Panel key={log.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-ink">{log.source}</p>
                  <p className="mt-2 text-sm text-slate/70">{log.message}</p>
                </div>
                <StatusBadge status={log.status ?? log.level} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.22em] text-slate/50">
                <span>{log.level}</span>
                <span>{formatDate(log.created_at)}</span>
                {log.pipeline_run_id ? <span>Run {log.pipeline_run_id}</span> : null}
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyState title="No logs yet" description="Logs will appear here after query execution and pipeline orchestration steps begin running." />
      )}
    </div>
  )
}
