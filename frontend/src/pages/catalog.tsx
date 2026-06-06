import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { DataTable } from '../components/data-table'
import { Button, EmptyState, Input, Label, PageHeader, Panel, Select, StatCard, Textarea } from '../components/ui'
import { api } from '../lib/api'
import { useTheme } from '../theme/theme-context'
import { formatDate } from '../lib/utils'

function freshnessTone(status?: string) {
  if (status === 'fresh') return 'bg-emerald-50 text-emerald-700'
  if (status === 'aging') return 'bg-amber-50 text-amber-700'
  if (status === 'stale') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

function governanceTone(status?: string) {
  if (status === 'excellent' || status === 'healthy') return 'bg-emerald-50 text-emerald-700'
  if (status === 'developing') return 'bg-amber-50 text-amber-700'
  if (status === 'at_risk' || status === 'weak') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

function lineageGraphTone(theme: 'light' | 'dark', active: boolean) {
  if (theme === 'dark') {
    return active
      ? 'border-cyan-400/30 bg-cyan-400/10 text-white'
      : 'border-white/10 bg-white/[0.03] text-white/55'
  }
  return active
    ? 'border-cyan-200 bg-cyan-50 text-slate-900'
    : 'border-slate-200 bg-slate-50 text-slate-500'
}

export function CatalogPage() {
  const { hasAnyRole } = useAuth()
  const canEdit = hasAnyRole('admin', 'analyst')
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [schemaFilter, setSchemaFilter] = useState('all')
  const [ownerDraft, setOwnerDraft] = useState('')
  const [tagsDraft, setTagsDraft] = useState('')
  const [lineageDraft, setLineageDraft] = useState('')
  const [statusMessage, setStatusMessage] = useState('Select a curated table to inspect governance metadata, ownership, freshness, and lineage hints.')
  const appliedSearchTableIdRef = useRef<string | null>(null)
  const tablesQuery = useQuery({ queryKey: ['tables'], queryFn: api.listTables })
  const previewQuery = useQuery({
    queryKey: ['tables', selectedTableId, 'preview'],
    queryFn: () => api.previewTable(selectedTableId!),
    enabled: Boolean(selectedTableId),
  })
  const lineageQuery = useQuery({
    queryKey: ['tables', selectedTableId, 'lineage'],
    queryFn: () => api.getTableLineage(selectedTableId!),
    enabled: Boolean(selectedTableId),
  })
  const updateMetadataMutation = useMutation({
    mutationFn: async (payload: { tableId: string; owner?: string; tags?: string[]; lineage_hint?: string }) =>
      api.updateTableMetadata(payload.tableId, { owner: payload.owner, tags: payload.tags, lineage_hint: payload.lineage_hint }),
    onSuccess: (table) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['tables', table.id, 'preview'] })
      setStatusMessage(`Updated catalog governance metadata for ${table.schema_name}.${table.name}.`)
    },
    onError: (error: Error) => setStatusMessage(error.message),
  })
  const refreshMutation = useMutation({
    mutationFn: api.refreshTableMetadata,
    onSuccess: (table) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['tables', table.id, 'preview'] })
      setStatusMessage(`Refreshed metadata for ${table.schema_name}.${table.name}.`)
    },
    onError: (error: Error) => setStatusMessage(error.message),
  })

  const tables = tablesQuery.data?.items ?? []

  useEffect(() => {
    const requestedTableId = searchParams.get('tableId')
    if (
      requestedTableId &&
      appliedSearchTableIdRef.current !== requestedTableId &&
      tables.some((table) => table.id === requestedTableId)
    ) {
      appliedSearchTableIdRef.current = requestedTableId
      setSelectedTableId(requestedTableId)
      return
    }

    if (!tables.length) {
      setSelectedTableId(null)
      return
    }

    if (!selectedTableId || !tables.some((table) => table.id === selectedTableId)) {
      setSelectedTableId(tables[0].id)
    }
  }, [searchParams, selectedTableId, tables])

  const schemaOptions = useMemo(
    () => ['all', ...Array.from(new Set(tables.map((table) => table.schema_name))).sort()],
    [tables],
  )

  const filteredTables = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return tables.filter((table) => {
      const matchesSchema = schemaFilter === 'all' || table.schema_name === schemaFilter
      const matchesSearch =
        !needle ||
        `${table.schema_name}.${table.name}`.toLowerCase().includes(needle) ||
        (table.description ?? '').toLowerCase().includes(needle)
      return matchesSchema && matchesSearch
    })
  }, [schemaFilter, search, tables])

  useEffect(() => {
    if (!filteredTables.length) {
      return
    }

    if (!selectedTableId || !filteredTables.some((table) => table.id === selectedTableId)) {
      setSelectedTableId(filteredTables[0].id)
    }
  }, [filteredTables, selectedTableId])

  const groupedTables = useMemo(() => {
    return filteredTables.reduce<Record<string, typeof filteredTables>>((accumulator, table) => {
      accumulator[table.schema_name] ??= []
      accumulator[table.schema_name].push(table)
      return accumulator
    }, {})
  }, [filteredTables])

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? null
  const selectedLineage = lineageQuery.data
  const governedTables = tables.filter((table) => (table.governance_score ?? 0) >= 75).length
  const averageGovernanceScore = tables.length
    ? Math.round(tables.reduce((sum, table) => sum + (table.governance_score ?? 0), 0) / tables.length)
    : 0
  const latestRefresh = tables
    .map((table) => table.last_refreshed_at ?? table.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1)

  useEffect(() => {
    if (!selectedTable) return
    setOwnerDraft(selectedTable.owner ?? '')
    setTagsDraft((selectedTable.tags ?? []).join(', '))
    setLineageDraft(selectedTable.lineage_hint ?? '')
    setStatusMessage(`Inspecting ${selectedTable.schema_name}.${selectedTable.name}.`)
  }, [selectedTableId, selectedTable])

  const openPipeline = (pipelineId: string) => navigate(`/pipelines?pipelineId=${encodeURIComponent(pipelineId)}`)
  const openDataset = (datasetId: string) => navigate(`/bi/datasets?datasetId=${encodeURIComponent(datasetId)}`)
  const openChart = (chartId: string) => navigate(`/bi/charts?chartId=${encodeURIComponent(chartId)}`)
  const openDashboard = (dashboardId: string) => navigate(`/bi/dashboards?dashboardId=${encodeURIComponent(dashboardId)}`)
  const openReports = (dashboardId?: string | null) =>
    navigate(dashboardId ? `/bi/reports?dashboardId=${encodeURIComponent(dashboardId)}` : '/bi/reports')

  const lineageGraphNodes = selectedLineage
    ? [
        {
          key: 'upstream',
          label:
            selectedLineage.upstream.kind === 'pipeline'
              ? selectedLineage.upstream.pipeline_name || 'Pipeline'
              : selectedLineage.upstream.kind === 'notebook'
                ? selectedLineage.upstream.notebook_name || 'Notebook'
                : selectedLineage.upstream.kind === 'sql'
                  ? 'SQL Publish'
                  : selectedLineage.upstream.label,
          meta: selectedLineage.upstream.kind.replace(/_/g, ' '),
          active: true,
          onClick:
            selectedLineage.upstream.pipeline_id
              ? () => openPipeline(selectedLineage.upstream.pipeline_id as string)
              : undefined,
        },
        {
          key: 'table',
          label: selectedTable ? `${selectedTable.schema_name}.${selectedTable.name}` : 'Delta Table',
          meta: 'curated delta table',
          active: true,
        },
        {
          key: 'datasets',
          label: `${selectedLineage.counts.semantic_datasets} dataset${selectedLineage.counts.semantic_datasets === 1 ? '' : 's'}`,
          meta: 'semantic layer',
          active: selectedLineage.counts.semantic_datasets > 0,
          onClick:
            selectedLineage.semantic_datasets[0]
              ? () => openDataset(selectedLineage.semantic_datasets[0].dataset_id)
              : undefined,
        },
        {
          key: 'charts',
          label: `${selectedLineage.counts.charts} chart${selectedLineage.counts.charts === 1 ? '' : 's'}`,
          meta: 'bi charts',
          active: selectedLineage.counts.charts > 0,
          onClick:
            selectedLineage.charts[0]
              ? () => openChart(selectedLineage.charts[0].chart_id)
              : undefined,
        },
        {
          key: 'dashboards',
          label: `${selectedLineage.counts.dashboards} dashboard${selectedLineage.counts.dashboards === 1 ? '' : 's'}`,
          meta: 'dashboards',
          active: selectedLineage.counts.dashboards > 0,
          onClick:
            selectedLineage.dashboards[0]
              ? () => openDashboard(selectedLineage.dashboards[0].dashboard_id)
              : undefined,
        },
        {
          key: 'reports',
          label: `${selectedLineage.counts.report_schedules} report${selectedLineage.counts.report_schedules === 1 ? '' : 's'}`,
          meta: 'scheduled exports',
          active: selectedLineage.counts.report_schedules > 0,
          onClick:
            selectedLineage.report_schedules[0]
              ? () => openReports(selectedLineage.report_schedules[0].dashboard_id)
              : undefined,
        },
      ]
    : []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Curated Zone"
        title="Lakehouse Catalog"
        description="Browse curated Delta Lake assets by schema, inspect table metadata and schema definitions, and jump straight into SQL exploration from the governed catalog."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Delta Tables" value={String(tables.length)} accent="bg-[#ffe2de]" subtext="Curated assets published into the lakehouse." />
        <StatCard label="Governed Assets" value={String(governedTables)} accent="bg-[#d8f1ff]" subtext="Assets scoring 75 or above on governance readiness." />
        <StatCard label="Average Score" value={`${averageGovernanceScore}/100`} accent="bg-[#e6f7eb]" subtext="Average metadata, freshness, and lineage coverage across the catalog." />
        <StatCard label="Latest Refresh" value={latestRefresh ? formatDate(latestRefresh) : 'N/A'} accent="bg-[#fff4d6]" subtext="Most recently updated curated asset in the catalog." />
      </div>

      <Panel className="rounded-2xl bg-cyan-50 p-4 text-sm text-lagoon">
        <p className="font-semibold">Catalog Status</p>
        <p className="mt-2 leading-6">{statusMessage}</p>
      </Panel>

      {!canEdit ? <Panel className="border-slate-200 bg-slate-50 text-sm text-slate-700">Your current role is read-only. You can browse curated assets and preview data here, but governance edits and metadata refreshes are limited to analysts and admins.</Panel> : null}

      {!tables.length ? (
        <EmptyState
          title="No curated tables yet"
          description="Write a query result to Delta Lake or run a pipeline with a Write Delta node to populate the lakehouse catalog."
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Panel className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Catalog Search</p>
              <Input
                className="mt-3"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search schema, table, or description"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Schema Filter</p>
              <Select className="mt-3" value={schemaFilter} onChange={(event) => setSchemaFilter(event.target.value)}>
                {schemaOptions.map((schema) => (
                  <option key={schema} value={schema}>
                    {schema === 'all' ? 'All schemas' : schema}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-4">
              {Object.entries(groupedTables).map(([schemaName, schemaTables]) => (
                <div key={schemaName}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">{schemaName}</p>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate/65">{schemaTables.length} tables</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {schemaTables.map((table) => (
                      <button
                        key={table.id}
                        type="button"
                        onClick={() => setSelectedTableId(table.id)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          selectedTableId === table.id
                            ? theme === 'dark'
                              ? 'shadow-[0_0_0_1px_rgba(246,242,74,0.10)]'
                              : 'border-lagoon bg-cyan-50/80 shadow-sm'
                            : theme === 'dark'
                              ? 'border-white/10 bg-white/[0.03]'
                              : 'border-slate-100 bg-slate-50/80'
                        }`}
                        style={
                          selectedTableId === table.id && theme === 'dark'
                            ? {
                                backgroundColor: 'rgba(246, 242, 74, 0.16)',
                                borderColor: 'rgba(246, 242, 74, 0.45)',
                                boxShadow: '0 0 0 1px rgba(246, 242, 74, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="break-words font-semibold text-ink">{table.name}</p>
                            <p className={`mt-1 text-sm ${selectedTableId === table.id && theme === 'dark' ? 'text-white/78' : 'text-slate/70'}`}>
                              {table.description || 'No catalog description yet.'}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                              theme === 'dark'
                                ? selectedTableId === table.id
                                  ? 'bg-black/25 text-[#fff7a8]'
                                  : 'bg-white/10 text-white/72'
                                : 'bg-white text-slate/60'
                            }`}
                          >
                            {table.mode}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${freshnessTone(table.freshness_status)}`}>
                            {table.freshness_status || 'unknown'}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${governanceTone(table.governance_status)}`}>
                            Governance {table.governance_score ?? 0}/100
                          </span>
                          {table.owner ? (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium ${
                                theme === 'dark'
                                  ? selectedTableId === table.id
                                    ? 'bg-black/20 text-white'
                                    : 'bg-white/10 text-white/80'
                                  : 'bg-white text-slate-700'
                              }`}
                            >
                              {table.owner}
                            </span>
                          ) : null}
                        </div>
                        <div
                          className={`mt-4 flex flex-wrap gap-2 text-xs ${
                            theme === 'dark'
                              ? selectedTableId === table.id
                                ? 'text-white/72'
                                : 'text-white/55'
                              : 'text-slate/60'
                          }`}
                        >
                          <span>{table.row_count ?? 0} rows</span>
                          <span>•</span>
                          <span>{table.schema_json?.length ?? 0} columns</span>
                          <span>•</span>
                          <span>{formatDate(table.updated_at)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {!filteredTables.length ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate/70">
                  No tables match the current search and schema filter.
                </div>
              ) : null}
            </div>
          </Panel>

          <div className="space-y-5">
            {selectedTable && previewQuery.data ? (
              <>
                <Panel className="space-y-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Selected Table</p>
                      <h2 className="mt-2 break-words font-display text-3xl text-ink">
                        {selectedTable.schema_name}.{selectedTable.name}
                      </h2>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate/70">
                        {selectedTable.description || 'This curated table is available for SQL exploration, downstream pipelines, and BI reporting.'}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${freshnessTone(selectedTable.freshness_status)}`}>
                          {selectedTable.freshness_status || 'unknown'}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${governanceTone(selectedTable.governance_status)}`}>
                          Governance {selectedTable.governance_score ?? 0}/100 · Grade {selectedTable.governance_grade ?? 'N/A'}
                        </span>
                        {selectedTable.tags?.map((tag) => (
                          <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {canEdit ? (
                        <Button tone="ghost" disabled={refreshMutation.isPending} onClick={() => refreshMutation.mutate(selectedTable.id)}>
                          {refreshMutation.isPending ? 'Refreshing...' : 'Refresh Metadata'}
                        </Button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => navigate(`/sql?table=${encodeURIComponent(selectedTable.name)}`)}
                        className="inline-flex items-center justify-center rounded-lg bg-[#ff3621] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e52c19]"
                      >
                        Open In SQL Workspace
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Rows</p>
                      <p className="mt-2 font-display text-2xl text-ink">{Intl.NumberFormat('en-IN').format(selectedTable.row_count ?? 0)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Columns</p>
                      <p className="mt-2 font-display text-2xl text-ink">{selectedTable.schema_json?.length ?? 0}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Write Mode</p>
                      <p className="mt-2 font-display text-2xl text-ink">{selectedTable.mode}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Last Refresh</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{formatDate(selectedTable.last_refreshed_at ?? selectedTable.updated_at)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Owner</p>
                      <p className="mt-2 text-sm font-semibold text-ink">{selectedTable.owner || 'Unassigned'}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="rounded-2xl bg-cyan-50 p-4 text-lagoon">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lagoon/70">Governance Score</p>
                      <div className="mt-3 flex items-end gap-3">
                        <p className="font-display text-4xl">{selectedTable.governance_score ?? 0}</p>
                        <p className="pb-1 text-sm font-semibold uppercase tracking-[0.18em]">
                          Grade {selectedTable.governance_grade ?? 'N/A'}
                        </p>
                      </div>
                      <p className="mt-3 text-sm leading-6">{selectedTable.governance_summary || 'Governance scoring will appear once metadata is evaluated.'}</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Strengths</p>
                        {selectedTable.governance_strengths?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedTable.governance_strengths.map((item) => (
                              <span key={item} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate/70">No standout governance strengths are recorded yet.</p>
                        )}
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Gaps</p>
                        {selectedTable.governance_gaps?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedTable.governance_gaps.map((item) => (
                              <span key={item} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate/70">No major governance gaps are currently flagged.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate/75">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Storage Location</p>
                      <p className="mt-2 break-all text-ink">{selectedTable.storage_path}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate/75">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Lineage Hint</p>
                      <p className="mt-2 line-clamp-4 text-ink">{selectedTable.lineage_hint || 'Lineage hint unavailable.'}</p>
                    </div>
                  </div>
                </Panel>

                <div className="grid gap-5 xl:grid-cols-[0.85fr_minmax(0,1.15fr)]">
                  <Panel>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Schema Definition</p>
                    <div className="mt-4 space-y-3">
                      {selectedTable.schema_json?.map((field, index) => (
                        <div key={`${field.name}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <div>
                            <p className="font-semibold text-ink">{field.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate/50">Column {index + 1}</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate">{field.type}</span>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  <div className="space-y-4">
                    <Panel className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Catalog Lineage</p>
                          <h3 className="mt-2 font-display text-2xl text-ink">Upstream and Downstream Relationships</h3>
                        </div>
                        <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-lagoon">
                          {lineageQuery.data?.counts.semantic_datasets ?? 0} datasets · {lineageQuery.data?.counts.dashboards ?? 0} dashboards
                        </span>
                      </div>

                      {selectedLineage ? (
                        <div className="space-y-4">
                          <div
                            className={`overflow-x-auto rounded-2xl border p-4 ${
                              theme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-100 bg-slate-50/80'
                            }`}
                          >
                            <div className="flex min-w-max items-center gap-3">
                              {lineageGraphNodes.map((node, index) => (
                                <div key={node.key} className="flex items-center gap-3">
                                  {node.onClick ? (
                                    <button
                                      type="button"
                                      onClick={node.onClick}
                                      className={`rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 ${
                                        lineageGraphTone(theme, node.active)
                                      }`}
                                    >
                                      <p className="max-w-[190px] break-words text-sm font-semibold">{node.label}</p>
                                      <p className={`mt-1 text-[11px] uppercase tracking-[0.18em] ${theme === 'dark' ? 'text-white/55' : 'text-slate/55'}`}>{node.meta}</p>
                                    </button>
                                  ) : (
                                    <div className={`rounded-2xl border px-4 py-3 ${lineageGraphTone(theme, node.active)}`}>
                                      <p className="max-w-[190px] break-words text-sm font-semibold">{node.label}</p>
                                      <p className={`mt-1 text-[11px] uppercase tracking-[0.18em] ${theme === 'dark' ? 'text-white/55' : 'text-slate/55'}`}>{node.meta}</p>
                                    </div>
                                  )}
                                  {index < lineageGraphNodes.length - 1 ? (
                                    <span className={`text-lg font-semibold ${theme === 'dark' ? 'text-white/35' : 'text-slate/35'}`}>→</span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Upstream Creator</p>
                            <p className="mt-2 text-sm font-semibold text-ink">{lineageQuery.data.upstream.label}</p>
                            {lineageQuery.data.upstream.pipeline_name ? (
                              <p className="mt-2 text-sm text-slate/70">
                                Pipeline {lineageQuery.data.upstream.pipeline_name}
                                {lineageQuery.data.upstream.node_id ? ` · ${lineageQuery.data.upstream.node_id}` : ''}
                              </p>
                            ) : null}
                            {lineageQuery.data.upstream.pipeline_id ? (
                              <button
                                type="button"
                                onClick={() => openPipeline(lineageQuery.data.upstream.pipeline_id as string)}
                                className="mt-3 text-sm font-semibold text-lagoon underline-offset-4 hover:underline"
                              >
                                Open Pipeline
                              </button>
                            ) : null}
                            {lineageQuery.data.upstream.notebook_name ? (
                              <p className="mt-2 text-sm text-slate/70">
                                Notebook {lineageQuery.data.upstream.notebook_name}
                                {lineageQuery.data.upstream.cell_title ? ` · ${lineageQuery.data.upstream.cell_title}` : ''}
                              </p>
                            ) : null}
                            {lineageQuery.data.upstream.source_query ? (
                              <pre className="mt-3 overflow-x-auto rounded-2xl bg-white p-3 text-xs leading-6 text-slate-700">
                                {lineageQuery.data.upstream.source_query}
                              </pre>
                            ) : null}
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Related Pipelines</p>
                              <div className="mt-3 space-y-3">
                                {lineageQuery.data.related_pipelines.length ? (
                                  lineageQuery.data.related_pipelines.map((pipeline) => (
                                    <button
                                      key={pipeline.pipeline_id}
                                      type="button"
                                      onClick={() => openPipeline(pipeline.pipeline_id)}
                                      className="w-full rounded-2xl bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
                                    >
                                      <p className="break-words font-semibold text-ink">{pipeline.pipeline_name}</p>
                                      <p className="mt-1 break-words text-sm text-slate/70">
                                        {pipeline.node_id || 'writeDelta node'}
                                        {pipeline.schedule_cron ? ` · ${pipeline.schedule_cron}` : ''}
                                      </p>
                                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate/50">{formatDate(pipeline.updated_at)}</p>
                                    </button>
                                  ))
                                ) : (
                                  <p className="text-sm text-slate/70">No pipeline definitions currently target this table.</p>
                                )}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Notebook Publishes</p>
                              <div className="mt-3 space-y-3">
                                {lineageQuery.data.notebook_artifacts.length ? (
                                  lineageQuery.data.notebook_artifacts.map((artifact) => (
                                    <div key={artifact.artifact_id} className="rounded-2xl bg-white p-3">
                                      <p className="break-words font-semibold text-ink">{artifact.display_name}</p>
                                      <p className="mt-1 break-words text-sm text-slate/70">
                                        {artifact.cell_title || artifact.cell_id} · {artifact.row_count ?? 0} rows
                                      </p>
                                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate/50">{formatDate(artifact.created_at)}</p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-slate/70">No notebook publish artifacts are recorded for this table yet.</p>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <button
                              type="button"
                              disabled={!lineageQuery.data.semantic_datasets[0]}
                              onClick={() => lineageQuery.data.semantic_datasets[0] && openDataset(lineageQuery.data.semantic_datasets[0].dataset_id)}
                              className="rounded-2xl bg-cyan-50 p-4 text-left text-lagoon transition disabled:cursor-default disabled:opacity-100"
                            >
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lagoon/70">Semantic Datasets</p>
                              <p className="mt-2 font-display text-2xl">{lineageQuery.data.counts.semantic_datasets}</p>
                            </button>
                            <button
                              type="button"
                              disabled={!lineageQuery.data.charts[0]}
                              onClick={() => lineageQuery.data.charts[0] && openChart(lineageQuery.data.charts[0].chart_id)}
                              className="rounded-2xl bg-emerald-50 p-4 text-left text-emerald-700 transition disabled:cursor-default disabled:opacity-100"
                            >
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700/70">Charts</p>
                              <p className="mt-2 font-display text-2xl">{lineageQuery.data.counts.charts}</p>
                            </button>
                            <button
                              type="button"
                              disabled={!lineageQuery.data.dashboards[0]}
                              onClick={() => lineageQuery.data.dashboards[0] && openDashboard(lineageQuery.data.dashboards[0].dashboard_id)}
                              className="rounded-2xl bg-violet-50 p-4 text-left text-violet-700 transition disabled:cursor-default disabled:opacity-100"
                            >
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700/70">Dashboards</p>
                              <p className="mt-2 font-display text-2xl">{lineageQuery.data.counts.dashboards}</p>
                            </button>
                            <button
                              type="button"
                              disabled={!lineageQuery.data.report_schedules[0]}
                              onClick={() => lineageQuery.data.report_schedules[0] && openReports(lineageQuery.data.report_schedules[0].dashboard_id)}
                              className="rounded-2xl bg-amber-50 p-4 text-left text-amber-700 transition disabled:cursor-default disabled:opacity-100"
                            >
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700/70">Report Schedules</p>
                              <p className="mt-2 font-display text-2xl">{lineageQuery.data.counts.report_schedules}</p>
                            </button>
                          </div>

                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Semantic Datasets</p>
                              <div className="mt-3 space-y-3">
                                {lineageQuery.data.semantic_datasets.length ? (
                                  lineageQuery.data.semantic_datasets.map((dataset) => (
                                    <button
                                      key={dataset.dataset_id}
                                      type="button"
                                      onClick={() => openDataset(dataset.dataset_id)}
                                      className="w-full rounded-2xl bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
                                    >
                                      <p className="break-words font-semibold text-ink">{dataset.dataset_name}</p>
                                      <p className="mt-1 text-sm text-slate/70">{dataset.metrics_count} metrics · {dataset.dimensions_count} dimensions</p>
                                    </button>
                                  ))
                                ) : (
                                  <p className="text-sm text-slate/70">No semantic datasets are registered from this table yet.</p>
                                )}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Charts</p>
                              <div className="mt-3 space-y-3">
                                {lineageQuery.data.charts.length ? (
                                  lineageQuery.data.charts.map((chart) => (
                                    <button
                                      key={chart.chart_id}
                                      type="button"
                                      onClick={() => openChart(chart.chart_id)}
                                      className="w-full rounded-2xl bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
                                    >
                                      <p className="break-words font-semibold text-ink">{chart.chart_name}</p>
                                      <p className="mt-1 text-sm text-slate/70">{chart.chart_type}</p>
                                    </button>
                                  ))
                                ) : (
                                  <p className="text-sm text-slate/70">No charts currently depend on this table.</p>
                                )}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Dashboards and Reports</p>
                              <div className="mt-3 space-y-3">
                                {lineageQuery.data.dashboards.length ? (
                                  lineageQuery.data.dashboards.map((dashboard) => (
                                    <button
                                      key={dashboard.dashboard_id}
                                      type="button"
                                      onClick={() => openDashboard(dashboard.dashboard_id)}
                                      className="w-full rounded-2xl bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm"
                                    >
                                      <p className="break-words font-semibold text-ink">{dashboard.dashboard_name}</p>
                                      <p className="mt-1 text-sm text-slate/70">{dashboard.dashboard_description || 'No dashboard description yet.'}</p>
                                    </button>
                                  ))
                                ) : (
                                  <p className="text-sm text-slate/70">No dashboards currently consume this table.</p>
                                )}
                                {lineageQuery.data.report_schedules.length ? (
                                  <div className="space-y-2 pt-2">
                                    {lineageQuery.data.report_schedules.map((schedule) => (
                                      <button
                                        key={schedule.schedule_id}
                                        type="button"
                                        onClick={() => openReports(schedule.dashboard_id)}
                                        className="w-full rounded-2xl bg-amber-50 px-3 py-2 text-left text-sm text-amber-800 transition hover:-translate-y-0.5"
                                      >
                                        {schedule.schedule_name} · {schedule.frequency}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate/70">Lineage relationships will appear here after the selected table is resolved.</p>
                      )}
                    </Panel>

                    <Panel className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Catalog Governance</p>
                          <h3 className="mt-2 font-display text-2xl text-ink">Scoring Breakdown and Stewardship</h3>
                        </div>
                        {canEdit ? (
                          <Button
                            disabled={updateMetadataMutation.isPending}
                            onClick={() =>
                              updateMetadataMutation.mutate({
                                tableId: selectedTable.id,
                                owner: ownerDraft,
                                tags: tagsDraft
                                  .split(',')
                                  .map((tag) => tag.trim())
                                  .filter(Boolean),
                                lineage_hint: lineageDraft,
                              })
                            }
                          >
                            {updateMetadataMutation.isPending ? 'Saving...' : 'Save Metadata'}
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid gap-3">
                        {(selectedTable.governance_breakdown ?? []).map((item) => (
                          <div key={item.key} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-ink">{item.label}</p>
                                <p className="mt-1 text-sm text-slate/70">{item.detail}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.status === 'strong' ? 'bg-emerald-50 text-emerald-700' : item.status === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                                  {item.status.replace('_', ' ')}
                                </span>
                                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate">
                                  {item.earned_points}/{item.max_points}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <fieldset className="grid gap-4" disabled={!canEdit}>
                        <div>
                          <Label>Owner</Label>
                          <Input value={ownerDraft} onChange={(event) => setOwnerDraft(event.target.value)} placeholder="analytics_engineering" />
                        </div>
                        <div>
                          <Label>Tags</Label>
                          <Input value={tagsDraft} onChange={(event) => setTagsDraft(event.target.value)} placeholder="delta, analytics, finance" />
                        </div>
                        <div>
                          <Label>Lineage Hint</Label>
                          <Textarea rows={4} value={lineageDraft} onChange={(event) => setLineageDraft(event.target.value)} />
                        </div>
                      </fieldset>
                    </Panel>
                    <Panel className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Preview Sample</p>
                        <h3 className="mt-2 font-display text-2xl text-ink">
                          {previewQuery.data.rows.length} preview rows
                        </h3>
                      </div>
                      <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-lagoon">DuckDB + Delta Lake</span>
                    </Panel>
                    <DataTable columns={previewQuery.data.columns} rows={previewQuery.data.rows} />
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                title="Select a curated table"
                description="Choose a table from the catalog to inspect schema details, storage metadata, and preview rows."
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
