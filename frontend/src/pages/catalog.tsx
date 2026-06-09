import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { DataTable } from '../components/data-table'
import { Button, EmptyState, Input, Label, PageHeader, Panel, Select, StatCard, Textarea } from '../components/ui'
import { api } from '../lib/api'
import { useTheme } from '../theme/theme-context'
import { cn, formatDate } from '../lib/utils'

type LineageFocus = 'upstream' | 'pipelines' | 'notebooks' | 'datasets' | 'charts' | 'dashboards' | 'reports'

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

function lineageFocusTone(theme: 'light' | 'dark', active: boolean) {
  if (theme === 'dark') {
    return active
      ? 'border-[#f6f24a]/35 bg-[#f6f24a]/12 text-white shadow-[0_0_0_1px_rgba(246,242,74,0.12)]'
      : 'border-white/10 bg-white/[0.03] text-white/60'
  }
  return active
    ? 'border-lagoon/20 bg-cyan-50 text-slate-900 shadow-sm'
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
  const [lineageFocus, setLineageFocus] = useState<LineageFocus>('upstream')
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
  const openNotebook = (notebookId: string) => navigate(`/engines?notebookId=${encodeURIComponent(notebookId)}`)
  const openDataset = (datasetId: string) => navigate(`/bi/datasets?datasetId=${encodeURIComponent(datasetId)}`)
  const openChart = (chartId: string) => navigate(`/bi/charts?chartId=${encodeURIComponent(chartId)}`)
  const openDashboard = (dashboardId: string) => navigate(`/bi/dashboards?dashboardId=${encodeURIComponent(dashboardId)}`)
  const openReports = (dashboardId?: string | null, scheduleId?: string | null) => {
    const params = new URLSearchParams()
    if (dashboardId) params.set('dashboardId', dashboardId)
    if (scheduleId) params.set('scheduleId', scheduleId)
    navigate(params.toString() ? `/bi/reports?${params.toString()}` : '/bi/reports')
  }

  useEffect(() => {
    if (!selectedLineage) return
    const nextFocusOrder: LineageFocus[] = ['upstream', 'pipelines', 'notebooks', 'datasets', 'charts', 'dashboards', 'reports']
    const activeFocuses = new Set<LineageFocus>([
      'upstream',
      ...(selectedLineage.related_pipelines.length ? (['pipelines'] as LineageFocus[]) : []),
      ...(selectedLineage.notebook_artifacts.length ? (['notebooks'] as LineageFocus[]) : []),
      ...(selectedLineage.semantic_datasets.length ? (['datasets'] as LineageFocus[]) : []),
      ...(selectedLineage.charts.length ? (['charts'] as LineageFocus[]) : []),
      ...(selectedLineage.dashboards.length ? (['dashboards'] as LineageFocus[]) : []),
      ...(selectedLineage.report_schedules.length ? (['reports'] as LineageFocus[]) : []),
    ])
    if (!activeFocuses.has(lineageFocus)) {
      setLineageFocus(nextFocusOrder.find((item) => activeFocuses.has(item)) ?? 'upstream')
    }
  }, [lineageFocus, selectedLineage])

  const renderLineageNode = ({
    label,
    meta,
    active,
    focus,
    onClick,
  }: {
    label: string
    meta: string
    active: boolean
    focus?: LineageFocus
    onClick?: () => void
  }) => {
    const content = (
      <>
        <p className="break-words text-sm font-semibold">{label}</p>
        <p className={cn('mt-1 text-[11px] uppercase tracking-[0.18em]', theme === 'dark' ? 'text-white/55' : 'text-slate/55')}>
          {meta}
        </p>
      </>
    )
    const className = cn(
      'min-w-[160px] rounded-2xl border px-4 py-3 text-left transition',
      focus ? lineageFocusTone(theme, lineageFocus === focus) : lineageGraphTone(theme, active),
      onClick ? 'hover:-translate-y-0.5 cursor-pointer' : '',
      !active && !focus ? 'opacity-70' : '',
    )
    if (onClick) {
      return (
        <button type="button" onClick={onClick} className={className}>
          {content}
        </button>
      )
    }
    return <div className={className}>{content}</div>
  }

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
                            className={cn(
                              'rounded-2xl border p-4',
                              theme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-100 bg-slate-50/80',
                            )}
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Mini Lineage Graph</p>
                                <p className="mt-2 text-sm leading-6 text-slate/70">
                                  Click any relationship family below to drill into the exact pipeline, notebook, dataset, chart, dashboard, or report assets attached to this table.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-lagoon">
                                  {selectedLineage.counts.semantic_datasets} datasets
                                </span>
                                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                  {selectedLineage.counts.charts} charts
                                </span>
                                <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                                  {selectedLineage.counts.dashboards} dashboards
                                </span>
                                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                  {selectedLineage.counts.report_schedules} reports
                                </span>
                              </div>
                            </div>

                            <div className="mt-5 grid gap-3">
                              <div className="flex flex-wrap items-center gap-3">
                                {renderLineageNode({
                                  label:
                                    selectedLineage.upstream.kind === 'pipeline'
                                      ? selectedLineage.upstream.pipeline_name || 'Pipeline publish'
                                      : selectedLineage.upstream.kind === 'notebook'
                                        ? selectedLineage.upstream.notebook_name || 'Notebook publish'
                                        : selectedLineage.upstream.kind === 'sql'
                                          ? 'SQL publish'
                                          : selectedLineage.upstream.label,
                                  meta: selectedLineage.upstream.kind.replace(/_/g, ' '),
                                  active: true,
                                  focus: 'upstream',
                                  onClick: () => setLineageFocus('upstream'),
                                })}
                                <span className={cn('text-lg font-semibold', theme === 'dark' ? 'text-white/35' : 'text-slate/35')}>→</span>
                                {renderLineageNode({
                                  label: selectedTable ? `${selectedTable.schema_name}.${selectedTable.name}` : 'Delta Table',
                                  meta: 'curated delta table',
                                  active: true,
                                })}
                              </div>

                              <div className="flex flex-wrap items-center gap-3">
                                {renderLineageNode({
                                  label: `${selectedLineage.counts.related_pipelines} pipeline target${selectedLineage.counts.related_pipelines === 1 ? '' : 's'}`,
                                  meta: 'orchestration layer',
                                  active: selectedLineage.counts.related_pipelines > 0,
                                  focus: 'pipelines',
                                  onClick: () => setLineageFocus('pipelines'),
                                })}
                                <span className={cn('text-lg font-semibold', theme === 'dark' ? 'text-white/35' : 'text-slate/35')}>→</span>
                                {renderLineageNode({
                                  label: selectedTable ? `${selectedTable.schema_name}.${selectedTable.name}` : 'Delta Table',
                                  meta: 'curated delta table',
                                  active: true,
                                })}
                              </div>

                              <div className="flex flex-wrap items-center gap-3">
                                {renderLineageNode({
                                  label: `${selectedLineage.counts.notebook_artifacts} notebook publish${selectedLineage.counts.notebook_artifacts === 1 ? '' : 'es'}`,
                                  meta: 'engine lab outputs',
                                  active: selectedLineage.counts.notebook_artifacts > 0,
                                  focus: 'notebooks',
                                  onClick: () => setLineageFocus('notebooks'),
                                })}
                                <span className={cn('text-lg font-semibold', theme === 'dark' ? 'text-white/35' : 'text-slate/35')}>→</span>
                                {renderLineageNode({
                                  label: selectedTable ? `${selectedTable.schema_name}.${selectedTable.name}` : 'Delta Table',
                                  meta: 'curated delta table',
                                  active: true,
                                })}
                              </div>

                              <div className="flex flex-wrap items-center gap-3">
                                {renderLineageNode({
                                  label: selectedTable ? `${selectedTable.schema_name}.${selectedTable.name}` : 'Delta Table',
                                  meta: 'curated delta table',
                                  active: true,
                                })}
                                <span className={cn('text-lg font-semibold', theme === 'dark' ? 'text-white/35' : 'text-slate/35')}>→</span>
                                {renderLineageNode({
                                  label: `${selectedLineage.counts.semantic_datasets} semantic dataset${selectedLineage.counts.semantic_datasets === 1 ? '' : 's'}`,
                                  meta: 'dataset explorer',
                                  active: selectedLineage.counts.semantic_datasets > 0,
                                  focus: 'datasets',
                                  onClick: () => setLineageFocus('datasets'),
                                })}
                                <span className={cn('text-lg font-semibold', theme === 'dark' ? 'text-white/35' : 'text-slate/35')}>→</span>
                                {renderLineageNode({
                                  label: `${selectedLineage.counts.charts} saved chart${selectedLineage.counts.charts === 1 ? '' : 's'}`,
                                  meta: 'chart builder',
                                  active: selectedLineage.counts.charts > 0,
                                  focus: 'charts',
                                  onClick: () => setLineageFocus('charts'),
                                })}
                                <span className={cn('text-lg font-semibold', theme === 'dark' ? 'text-white/35' : 'text-slate/35')}>→</span>
                                {renderLineageNode({
                                  label: `${selectedLineage.counts.dashboards} dashboard${selectedLineage.counts.dashboards === 1 ? '' : 's'}`,
                                  meta: 'dashboard viewer',
                                  active: selectedLineage.counts.dashboards > 0,
                                  focus: 'dashboards',
                                  onClick: () => setLineageFocus('dashboards'),
                                })}
                                <span className={cn('text-lg font-semibold', theme === 'dark' ? 'text-white/35' : 'text-slate/35')}>→</span>
                                {renderLineageNode({
                                  label: `${selectedLineage.counts.report_schedules} scheduled report${selectedLineage.counts.report_schedules === 1 ? '' : 's'}`,
                                  meta: 'report scheduler',
                                  active: selectedLineage.counts.report_schedules > 0,
                                  focus: 'reports',
                                  onClick: () => setLineageFocus('reports'),
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
                            <div className={cn('rounded-2xl border p-4', theme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-100 bg-slate-50')}>
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Dependency Focus</p>
                              <div className="mt-4 flex flex-wrap gap-2">
                                {([
                                  ['upstream', 'Upstream'],
                                  ['pipelines', 'Pipelines'],
                                  ['notebooks', 'Notebook Publishes'],
                                  ['datasets', 'Datasets'],
                                  ['charts', 'Charts'],
                                  ['dashboards', 'Dashboards'],
                                  ['reports', 'Reports'],
                                ] as Array<[LineageFocus, string]>).map(([focusKey, label]) => (
                                  <button
                                    key={focusKey}
                                    type="button"
                                    onClick={() => setLineageFocus(focusKey)}
                                    className={cn(
                                      'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition',
                                      lineageFocusTone(theme, lineageFocus === focusKey),
                                    )}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>

                              <div className="mt-5 rounded-2xl bg-cyan-50 p-4 text-sm text-lagoon">
                                <p className="font-semibold">Drill-down Guidance</p>
                                <p className="mt-2 leading-6">
                                  Use the focus buttons or graph nodes to pivot between producers and consumers. Each drill-down card below jumps into the exact platform surface that owns that dependency.
                                </p>
                              </div>

                              <div className={cn('mt-4 rounded-2xl p-4', theme === 'dark' ? 'bg-black/20' : 'bg-slate-50')}>
                                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Lineage Hint</p>
                                <p className="mt-2 text-sm leading-6 text-ink">{selectedTable.lineage_hint || 'Lineage hint unavailable.'}</p>
                              </div>
                            </div>

                            <div className={cn('rounded-2xl border p-4', theme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-100 bg-slate-50')}>
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Dependency Drill-down</p>
                                  <h4 className="mt-2 font-display text-2xl text-ink">
                                    {lineageFocus === 'upstream'
                                      ? 'Upstream Creator'
                                      : lineageFocus === 'pipelines'
                                        ? 'Pipeline Relationships'
                                        : lineageFocus === 'notebooks'
                                          ? 'Notebook Publish Artifacts'
                                          : lineageFocus === 'datasets'
                                            ? 'Semantic Datasets'
                                            : lineageFocus === 'charts'
                                              ? 'Saved Charts'
                                              : lineageFocus === 'dashboards'
                                                ? 'Dashboards'
                                                : 'Scheduled Reports'}
                                  </h4>
                                </div>
                                <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', theme === 'dark' ? 'bg-black/25 text-white/70' : 'bg-white text-slate/65')}>
                                  {lineageFocus === 'upstream'
                                    ? '1 relationship'
                                    : lineageFocus === 'pipelines'
                                      ? `${selectedLineage.related_pipelines.length} items`
                                      : lineageFocus === 'notebooks'
                                        ? `${selectedLineage.notebook_artifacts.length} items`
                                        : lineageFocus === 'datasets'
                                          ? `${selectedLineage.semantic_datasets.length} items`
                                          : lineageFocus === 'charts'
                                            ? `${selectedLineage.charts.length} items`
                                            : lineageFocus === 'dashboards'
                                              ? `${selectedLineage.dashboards.length} items`
                                              : `${selectedLineage.report_schedules.length} items`}
                                </span>
                              </div>

                              <div className="mt-4 space-y-3">
                                {lineageFocus === 'upstream' ? (
                                  <div className={cn('rounded-2xl p-4', theme === 'dark' ? 'bg-black/20' : 'bg-white')}>
                                    <p className="font-semibold text-ink">{selectedLineage.upstream.label}</p>
                                    <p className="mt-2 text-sm leading-6 text-slate/70">
                                      {selectedLineage.upstream.pipeline_name
                                        ? `Pipeline ${selectedLineage.upstream.pipeline_name}${selectedLineage.upstream.node_id ? ` · ${selectedLineage.upstream.node_id}` : ''}`
                                        : selectedLineage.upstream.notebook_name
                                          ? `Notebook ${selectedLineage.upstream.notebook_name}${selectedLineage.upstream.cell_title ? ` · ${selectedLineage.upstream.cell_title}` : ''}`
                                          : selectedLineage.upstream.kind === 'sql'
                                            ? 'This table was published from SQL workspace output.'
                                            : 'No upstream publisher metadata is currently available.'}
                                    </p>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      {selectedLineage.upstream.pipeline_id ? (
                                        <Button tone="ghost" onClick={() => openPipeline(selectedLineage.upstream.pipeline_id as string)}>
                                          Open Pipeline
                                        </Button>
                                      ) : null}
                                      {selectedLineage.upstream.notebook_id ? (
                                        <Button tone="ghost" onClick={() => openNotebook(selectedLineage.upstream.notebook_id as string)}>
                                          Open Notebook
                                        </Button>
                                      ) : null}
                                      <Button tone="ghost" onClick={() => navigate(`/sql?table=${encodeURIComponent(`${selectedTable.schema_name}.${selectedTable.name}`)}`)}>
                                        Open in SQL Workspace
                                      </Button>
                                    </div>
                                    {selectedLineage.upstream.source_query ? (
                                      <pre className={cn('mt-4 overflow-x-auto rounded-2xl p-3 text-xs leading-6', theme === 'dark' ? 'bg-black/25 text-white/75' : 'bg-slate-50 text-slate-700')}>
                                        {selectedLineage.upstream.source_query}
                                      </pre>
                                    ) : null}
                                  </div>
                                ) : null}

                                {lineageFocus === 'pipelines' ? (
                                  selectedLineage.related_pipelines.length ? (
                                    selectedLineage.related_pipelines.map((pipeline) => (
                                      <div key={pipeline.pipeline_id} className={cn('rounded-2xl p-4', theme === 'dark' ? 'bg-black/20' : 'bg-white')}>
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <p className="font-semibold text-ink">{pipeline.pipeline_name}</p>
                                            <p className="mt-1 text-sm text-slate/70">
                                              {pipeline.node_id || 'writeDelta node'}
                                              {pipeline.schedule_cron ? ` · ${pipeline.schedule_cron}` : ''}
                                            </p>
                                          </div>
                                          <Button tone="ghost" onClick={() => openPipeline(pipeline.pipeline_id)}>
                                            Open
                                          </Button>
                                        </div>
                                        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate/50">{formatDate(pipeline.updated_at)}</p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm text-slate/70">No pipeline definitions currently target this table.</p>
                                  )
                                ) : null}

                                {lineageFocus === 'notebooks' ? (
                                  selectedLineage.notebook_artifacts.length ? (
                                    selectedLineage.notebook_artifacts.map((artifact) => (
                                      <div key={artifact.artifact_id} className={cn('rounded-2xl p-4', theme === 'dark' ? 'bg-black/20' : 'bg-white')}>
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <p className="font-semibold text-ink">{artifact.display_name}</p>
                                            <p className="mt-1 text-sm text-slate/70">
                                              {artifact.cell_title || artifact.cell_id} · {artifact.row_count ?? 0} rows
                                            </p>
                                          </div>
                                          <Button tone="ghost" onClick={() => openNotebook(artifact.notebook_id)}>
                                            Open Notebook
                                          </Button>
                                        </div>
                                        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate/50">{formatDate(artifact.created_at)}</p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm text-slate/70">No notebook publish artifacts are recorded for this table yet.</p>
                                  )
                                ) : null}

                                {lineageFocus === 'datasets' ? (
                                  selectedLineage.semantic_datasets.length ? (
                                    selectedLineage.semantic_datasets.map((dataset) => (
                                      <div key={dataset.dataset_id} className={cn('rounded-2xl p-4', theme === 'dark' ? 'bg-black/20' : 'bg-white')}>
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <p className="font-semibold text-ink">{dataset.dataset_name}</p>
                                            <p className="mt-1 text-sm text-slate/70">{dataset.metrics_count} metrics · {dataset.dimensions_count} dimensions</p>
                                          </div>
                                          <Button tone="ghost" onClick={() => openDataset(dataset.dataset_id)}>
                                            Open Dataset
                                          </Button>
                                        </div>
                                        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate/50">{formatDate(dataset.updated_at)}</p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm text-slate/70">No semantic datasets are registered from this table yet.</p>
                                  )
                                ) : null}

                                {lineageFocus === 'charts' ? (
                                  selectedLineage.charts.length ? (
                                    selectedLineage.charts.map((chart) => (
                                      <div key={chart.chart_id} className={cn('rounded-2xl p-4', theme === 'dark' ? 'bg-black/20' : 'bg-white')}>
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <p className="font-semibold text-ink">{chart.chart_name}</p>
                                            <p className="mt-1 text-sm text-slate/70">{chart.chart_type}</p>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            <Button tone="ghost" onClick={() => openChart(chart.chart_id)}>
                                              Open Chart
                                            </Button>
                                            {chart.dataset_id ? (
                                              <Button tone="ghost" onClick={() => openDataset(chart.dataset_id as string)}>
                                                Dataset
                                              </Button>
                                            ) : null}
                                          </div>
                                        </div>
                                        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate/50">{formatDate(chart.updated_at)}</p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm text-slate/70">No charts currently depend on this table.</p>
                                  )
                                ) : null}

                                {lineageFocus === 'dashboards' ? (
                                  selectedLineage.dashboards.length ? (
                                    selectedLineage.dashboards.map((dashboard) => (
                                      <div key={dashboard.dashboard_id} className={cn('rounded-2xl p-4', theme === 'dark' ? 'bg-black/20' : 'bg-white')}>
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <p className="font-semibold text-ink">{dashboard.dashboard_name}</p>
                                            <p className="mt-1 text-sm text-slate/70">{dashboard.dashboard_description || 'No dashboard description yet.'}</p>
                                          </div>
                                          <Button tone="ghost" onClick={() => openDashboard(dashboard.dashboard_id)}>
                                            Open Dashboard
                                          </Button>
                                        </div>
                                        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate/50">{formatDate(dashboard.updated_at)}</p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm text-slate/70">No dashboards currently consume this table.</p>
                                  )
                                ) : null}

                                {lineageFocus === 'reports' ? (
                                  selectedLineage.report_schedules.length ? (
                                    selectedLineage.report_schedules.map((schedule) => (
                                      <div key={schedule.schedule_id} className={cn('rounded-2xl p-4', theme === 'dark' ? 'bg-black/20' : 'bg-white')}>
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <p className="font-semibold text-ink">{schedule.schedule_name}</p>
                                            <p className="mt-1 text-sm text-slate/70">
                                              {schedule.frequency} · {schedule.destination}
                                            </p>
                                          </div>
                                          <Button tone="ghost" onClick={() => openReports(schedule.dashboard_id, schedule.schedule_id)}>
                                            Open Schedule
                                          </Button>
                                        </div>
                                        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate/50">{formatDate(schedule.updated_at)}</p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm text-slate/70">No scheduled reports currently depend on this table.</p>
                                  )
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
