import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Button, EmptyState, Input, Label, PageHeader, Panel, Select, Textarea } from '../components/ui'
import { StatusBadge } from '../components/status-badge'
import { api } from '../lib/api'
import { formatDate } from '../lib/utils'

function describeNextRun(frequency: string) {
  const now = new Date()
  const next = new Date(now)
  if (frequency === 'daily') next.setDate(now.getDate() + 1)
  if (frequency === 'weekly') next.setDate(now.getDate() + 7)
  if (frequency === 'monthly') next.setMonth(now.getMonth() + 1)
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(next)
}

export function ReportSchedulerPage() {
  const queryClient = useQueryClient()
  const dashboardsQuery = useQuery({ queryKey: ['bi', 'dashboards'], queryFn: api.listDashboards })
  const schedulesQuery = useQuery({ queryKey: ['bi', 'report-schedules'], queryFn: api.listReportSchedules })
  const snapshotsQuery = useQuery({ queryKey: ['bi', 'report-snapshots'], queryFn: api.listReportSnapshots })
  const [name, setName] = useState('Weekly Sales Dashboard Snapshot')
  const [frequency, setFrequency] = useState('weekly')
  const [dashboardId, setDashboardId] = useState('')
  const [destination, setDestination] = useState('local_export')
  const [format, setFormat] = useState('pdf')
  const [deliveryNote, setDeliveryNote] = useState('Export this dashboard snapshot for internal review.')
  const [statusMessage, setStatusMessage] = useState('Create recurring dashboard snapshots, run them on demand, and retain a real artifact history in local storage.')

  useEffect(() => {
    if (!dashboardId && dashboardsQuery.data?.items?.[0]) {
      setDashboardId(dashboardsQuery.data.items[0].id)
    }
  }, [dashboardId, dashboardsQuery.data])

  const selectedDashboard = useMemo(
    () => dashboardsQuery.data?.items.find((dashboard) => dashboard.id === dashboardId) ?? null,
    [dashboardId, dashboardsQuery.data],
  )

  const createMutation = useMutation({
    mutationFn: api.createReportSchedule,
    onSuccess: (schedule: { name?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['bi', 'report-schedules'] })
      setStatusMessage(`Saved report schedule ${schedule.name ?? name}.`)
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteReportSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bi', 'report-schedules'] })
      setStatusMessage('Report schedule deleted successfully.')
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  const runMutation = useMutation({
    mutationFn: api.runReportSchedule,
    onSuccess: ({ schedule, snapshot }) => {
      queryClient.invalidateQueries({ queryKey: ['bi', 'report-schedules'] })
      queryClient.invalidateQueries({ queryKey: ['bi', 'report-snapshots'] })
      setStatusMessage(
        snapshot.status === 'success'
          ? `Executed ${schedule.name}. Artifact written to ${snapshot.artifact_path}.`
          : `Execution failed for ${schedule.name}: ${snapshot.error_message ?? 'Unknown error'}`,
      )
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  const saveSchedule = () => {
    createMutation.mutate({
      name,
      dashboard_id: dashboardId || undefined,
      frequency,
      destination,
      config_json: {
        format,
        deliveryNote,
        nextRunEstimate: describeNextRun(frequency),
      },
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Scheduled Reporting"
        title="Report Scheduler"
        description="Define recurring dashboard snapshots, choose export destinations and formats, and manage the report schedule catalog for internal BI demos."
      />

      <Panel className="grid gap-4 xl:grid-cols-[1fr_0.85fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Scheduling Flow</p>
          <p className="mt-2 text-sm leading-6 text-slate/75">Choose a dashboard, pick a cadence, define the export format, and execute report runs that generate stored artifacts into the local `storage/` workspace.</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate/75">
          <p className="font-semibold text-ink">Execution Scope</p>
          <p className="mt-2 leading-6">CSV and Excel requests generate zipped CSV bundles. PDF and PNG requests generate a render-ready HTML report artifact in this MVP so every schedule run stores a usable file and history record.</p>
        </div>
        <div className="rounded-2xl bg-cyan-50 p-4 text-sm text-lagoon">
          <p className="font-semibold">Scheduler Status</p>
          <p className="mt-2 leading-6">{statusMessage}</p>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_minmax(0,0.95fr)]">
        <div className="space-y-5">
          <Panel className="space-y-4">
            <div>
              <Label>Schedule Name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Frequency</Label>
                <Select value={frequency} onChange={(event) => setFrequency(event.target.value)}>
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                </Select>
              </div>
              <div>
                <Label>Dashboard</Label>
                <Select value={dashboardId} onChange={(event) => setDashboardId(event.target.value)}>
                  <option value="">Select dashboard</option>
                  {dashboardsQuery.data?.items?.map((dashboard) => (
                    <option key={dashboard.id} value={dashboard.id}>
                      {dashboard.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Destination</Label>
                <Select value={destination} onChange={(event) => setDestination(event.target.value)}>
                  <option value="local_export">local_export</option>
                  <option value="shared_folder">shared_folder</option>
                  <option value="email_placeholder">email_placeholder</option>
                </Select>
              </div>
              <div>
                <Label>Format</Label>
                <Select value={format} onChange={(event) => setFormat(event.target.value)}>
                  <option value="pdf">pdf</option>
                  <option value="png">png</option>
                  <option value="csv">csv</option>
                  <option value="excel">excel</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>Delivery Note</Label>
              <Textarea rows={4} value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Target Dashboard</p>
                <p className="mt-2 text-sm font-semibold text-ink">{selectedDashboard?.name || 'Not selected'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Estimated Next Run</p>
                <p className="mt-2 text-sm font-semibold text-ink">{describeNextRun(frequency)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Output Format</p>
                <p className="mt-2 text-sm font-semibold text-ink">{format}</p>
              </div>
            </div>
            <Button disabled={createMutation.isPending} onClick={saveSchedule}>
              {createMutation.isPending ? 'Saving...' : 'Save Schedule'}
            </Button>
          </Panel>

          {selectedDashboard ? (
            <Panel className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Dashboard Context</p>
              <h2 className="font-display text-2xl text-ink">{selectedDashboard.name}</h2>
              <p className="text-sm leading-6 text-slate/70">{selectedDashboard.description || 'No dashboard description provided yet.'}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Updated</p>
                  <p className="mt-2 text-sm font-semibold text-ink">{formatDate(selectedDashboard.updated_at)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Layout Metadata</p>
                  <p className="mt-2 text-sm font-semibold text-ink">{JSON.stringify(selectedDashboard.layout_json)}</p>
                </div>
              </div>
            </Panel>
          ) : null}
        </div>

        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Saved Schedules</p>
              <h2 className="font-display text-2xl text-ink">Schedule Library</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate/65">
              {schedulesQuery.data?.items?.length ?? 0}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {schedulesQuery.data?.items?.length ? (
              schedulesQuery.data.items.map((schedule) => {
                const linkedDashboard = dashboardsQuery.data?.items?.find((dashboard) => dashboard.id === schedule.dashboard_id)
                return (
                  <div key={schedule.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-ink">{schedule.name}</p>
                        <p className="mt-2 text-sm text-slate/70">{linkedDashboard?.name || 'No linked dashboard'} • {schedule.frequency}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button tone="ghost" disabled={runMutation.isPending} onClick={() => runMutation.mutate(schedule.id)}>
                          {runMutation.isPending ? 'Running...' : 'Run Now'}
                        </Button>
                        <Button tone="danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(schedule.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700">Destination: {schedule.destination}</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700">Format: {String(schedule.config_json.format ?? 'n/a')}</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700">Next run: {String(schedule.config_json.nextRunEstimate ?? 'n/a')}</span>
                      {schedule.config_json.lastRunStatus ? <StatusBadge status={String(schedule.config_json.lastRunStatus)} /> : null}
                    </div>
                    {schedule.config_json.lastArtifactPath ? (
                      <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate/70">
                        <p className="font-semibold text-ink">Latest Artifact</p>
                        <p className="mt-2 break-all">{String(schedule.config_json.lastArtifactPath)}</p>
                      </div>
                    ) : null}
                    <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate/50">Updated {formatDate(schedule.updated_at)}</p>
                  </div>
                )
              })
            ) : (
              <EmptyState title="No report schedules yet" description="Save a recurring snapshot from the form on the left to populate the scheduler library." />
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Snapshot History</p>
            <h2 className="font-display text-2xl text-ink">Execution Timeline</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate/65">
            {snapshotsQuery.data?.items?.length ?? 0}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {snapshotsQuery.data?.items?.length ? (
            snapshotsQuery.data.items.map((snapshot) => (
              <div key={snapshot.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-semibold text-ink">{snapshot.schedule_name}</p>
                    <p className="mt-1 text-sm text-slate/70">{snapshot.dashboard_name || 'No dashboard linked'} • {snapshot.requested_format}</p>
                  </div>
                  <StatusBadge status={snapshot.status} />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate/50">Artifact Kind</p>
                    <p className="mt-2 text-sm font-semibold text-ink">{snapshot.artifact_kind || 'pending'}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate/50">Started</p>
                    <p className="mt-2 text-sm font-semibold text-ink">{snapshot.started_at ? formatDate(snapshot.started_at) : 'n/a'}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate/50">Finished</p>
                    <p className="mt-2 text-sm font-semibold text-ink">{snapshot.finished_at ? formatDate(snapshot.finished_at) : 'n/a'}</p>
                  </div>
                </div>
                {snapshot.artifact_path ? (
                  <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate/70">
                    <p className="font-semibold text-ink">Stored Artifact</p>
                    <p className="mt-2 break-all">{snapshot.artifact_path}</p>
                  </div>
                ) : null}
                {snapshot.error_message ? (
                  <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {snapshot.error_message}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <EmptyState title="No snapshot history yet" description="Run a saved schedule to generate stored artifacts and populate the execution timeline." />
          )}
        </div>
      </Panel>
    </div>
  )
}
