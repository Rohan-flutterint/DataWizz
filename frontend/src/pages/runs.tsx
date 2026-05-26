import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { StatusBadge } from '../components/status-badge'
import { EmptyState, PageHeader, Panel } from '../components/ui'
import { api } from '../lib/api'
import { formatDate } from '../lib/utils'

export function PipelineRunsPage() {
  const runsQuery = useQuery({ queryKey: ['runs'], queryFn: api.listRuns })
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const detailQuery = useQuery({
    queryKey: ['runs', selectedRunId],
    queryFn: () => api.getRunDetails(selectedRunId!),
    enabled: Boolean(selectedRunId),
  })

  useEffect(() => {
    const runs = runsQuery.data?.items ?? []
    if (!runs.length) {
      setSelectedRunId(null)
      return
    }

    if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs[0].id)
    }
  }, [runsQuery.data, selectedRunId])

  const runs = runsQuery.data?.items ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Execution History"
        title="Pipeline Runs"
        description="Track pipeline execution status, inspect exact failure causes, and review per-step logs for every manual run across the lakehouse."
      />

      {runs.length ? (
        <div className="grid gap-5 xl:grid-cols-[1.1fr_minmax(0,0.9fr)]">
          <div className="space-y-4">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedRunId(run.id)}
                className="w-full text-left"
              >
                <Panel
                  className={`transition ${
                    selectedRunId === run.id ? 'border-lagoon bg-cyan-50/50 shadow-sm' : 'hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Run ID</p>
                      <p className="mt-2 font-display text-2xl text-ink">{run.id}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-800">{run.pipeline_name || run.pipeline_id}</p>
                      {run.pipeline_name ? <p className="mt-1 text-xs text-slate/60">Pipeline {run.pipeline_id}</p> : null}
                      <p className="mt-2 text-sm text-slate/70">
                        Started {formatDate(run.started_at)} • Finished {formatDate(run.finished_at)}
                      </p>
                    </div>
                    <StatusBadge status={run.status} />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate/50">Trigger</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{run.trigger_type}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate/50">Duration</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{run.duration_ms ?? 0} ms</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate/50">Created</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{formatDate(run.created_at)}</p>
                    </div>
                  </div>
                  {run.error_message ? (
                    <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
                      {run.error_message}
                    </p>
                  ) : null}
                </Panel>
              </button>
            ))}
          </div>

          <div className="space-y-5">
            {detailQuery.data ? (
              <>
                <Panel className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Run Details</p>
                      <h2 className="mt-2 font-display text-3xl text-ink">{detailQuery.data.pipeline?.name || detailQuery.data.run.pipeline_name || 'Pipeline Run'}</h2>
                      <p className="mt-2 text-sm text-slate/70">Run {detailQuery.data.run.id}</p>
                    </div>
                    <StatusBadge status={detailQuery.data.run.status} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Pipeline ID</p>
                      <p className="mt-2 break-all text-sm font-semibold text-ink">{detailQuery.data.run.pipeline_id}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Schedule</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{detailQuery.data.pipeline?.schedule_cron || 'Manual run only'}</p>
                    </div>
                  </div>

                  {detailQuery.data.run.error_message ? (
                    <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-600">Failure Reason</p>
                      <p className="mt-3 text-sm leading-6 text-rose-800">{detailQuery.data.run.error_message}</p>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Run Outcome</p>
                      <p className="mt-3 text-sm leading-6 text-emerald-800">This run completed without a recorded pipeline error.</p>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Started</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{formatDate(detailQuery.data.run.started_at)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Finished</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{formatDate(detailQuery.data.run.finished_at)}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-950 p-4 text-slate-100">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">Run Summary</p>
                    <pre className="mt-3 overflow-x-auto text-xs leading-6">
                      {JSON.stringify(detailQuery.data.run.run_summary ?? {}, null, 2)}
                    </pre>
                  </div>
                </Panel>

                <Panel>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Step Logs</p>
                  <div className="mt-4 space-y-3">
                    {detailQuery.data.logs.length ? (
                      detailQuery.data.logs.map((log) => (
                        <div key={log.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-ink">{log.source}</p>
                              <p className="mt-2 text-sm leading-6 text-slate/75">{log.message}</p>
                            </div>
                            <StatusBadge status={log.status ?? log.level} />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.2em] text-slate/50">
                            <span>{log.level}</span>
                            <span>{formatDate(log.created_at)}</span>
                          </div>
                          {log.context_json ? (
                            <pre className="mt-3 overflow-x-auto rounded-2xl bg-white p-3 text-xs leading-6 text-slate-700">
                              {JSON.stringify(log.context_json, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate/70">
                        No step-level logs were recorded for this run.
                      </div>
                    )}
                  </div>
                </Panel>
              </>
            ) : (
              <EmptyState
                title="Select a pipeline run"
                description="Choose a run from the left to inspect the exact failure reason, step logs, and execution summary."
              />
            )}
          </div>
        </div>
      ) : (
        <EmptyState title="No pipeline runs yet" description="Execute a saved pipeline from the builder to populate run history and operational metrics." />
      )}
    </div>
  )
}
