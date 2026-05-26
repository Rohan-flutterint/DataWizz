import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, Input, Label, PageHeader, Panel, Select } from '../components/ui'
import { api } from '../lib/api'

export function ReportSchedulerPage() {
  const dashboardsQuery = useQuery({ queryKey: ['bi', 'dashboards'], queryFn: api.listDashboards })
  const [name, setName] = useState('Weekly Sales Dashboard Snapshot')
  const [frequency, setFrequency] = useState('weekly')
  const [dashboardId, setDashboardId] = useState('')

  const createMutation = useMutation({ mutationFn: api.createReportSchedule })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Scheduled Reporting"
        title="Report Scheduler"
        description="Define recurring dashboard snapshots for demo purposes today, with a clear extension path toward email delivery, PDFs, and richer subscriptions later."
      />

      <Panel className="max-w-2xl space-y-4">
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
        </div>
        <Button onClick={() => createMutation.mutate({ name, frequency, dashboard_id: dashboardId || undefined, destination: 'local_export', config_json: { format: 'pdf' } })}>
          Save Schedule
        </Button>
        {createMutation.isSuccess ? <p className="text-sm text-emerald-700">Report schedule saved successfully.</p> : null}
      </Panel>
    </div>
  )
}
