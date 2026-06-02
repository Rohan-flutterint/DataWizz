import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DataTable } from '../components/data-table'
import { Button, EmptyState, Input, Label, PageHeader, Panel, Select, StatCard, Textarea } from '../components/ui'
import { api } from '../lib/api'
import { formatDate } from '../lib/utils'

function freshnessTone(status?: string) {
  if (status === 'fresh') return 'bg-emerald-50 text-emerald-700'
  if (status === 'aging') return 'bg-amber-50 text-amber-700'
  if (status === 'stale') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

export function CatalogPage() {
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
  const freshTables = tables.filter((table) => table.freshness_status === 'fresh').length
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Curated Zone"
        title="Lakehouse Catalog"
        description="Browse curated Delta Lake assets by schema, inspect table metadata and schema definitions, and jump straight into SQL exploration from the governed catalog."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Delta Tables" value={String(tables.length)} accent="bg-[#ffe2de]" subtext="Curated assets published into the lakehouse." />
        <StatCard label="Schemas" value={String(schemaOptions.length - 1)} accent="bg-[#d8f1ff]" subtext="Logical namespaces available to analysts and pipelines." />
        <StatCard label="Fresh Assets" value={String(freshTables)} accent="bg-[#e6f7eb]" subtext="Curated tables refreshed recently enough to be considered fresh." />
        <StatCard label="Latest Refresh" value={latestRefresh ? formatDate(latestRefresh) : 'N/A'} accent="bg-[#fff4d6]" subtext="Most recently updated curated asset in the catalog." />
      </div>

      <Panel className="rounded-2xl bg-cyan-50 p-4 text-sm text-lagoon">
        <p className="font-semibold">Catalog Status</p>
        <p className="mt-2 leading-6">{statusMessage}</p>
      </Panel>

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
                          selectedTableId === table.id ? 'border-lagoon bg-cyan-50/80 shadow-sm' : 'border-slate-100 bg-slate-50/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">{table.name}</p>
                            <p className="mt-1 text-sm text-slate/70">{table.description || 'No catalog description yet.'}</p>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/60">
                            {table.mode}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${freshnessTone(table.freshness_status)}`}>
                            {table.freshness_status || 'unknown'}
                          </span>
                          {table.owner ? <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700">{table.owner}</span> : null}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate/60">
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
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Selected Table</p>
                      <h2 className="mt-2 font-display text-3xl text-ink">
                        {selectedTable.schema_name}.{selectedTable.name}
                      </h2>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate/70">
                        {selectedTable.description || 'This curated table is available for SQL exploration, downstream pipelines, and BI reporting.'}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${freshnessTone(selectedTable.freshness_status)}`}>
                          {selectedTable.freshness_status || 'unknown'}
                        </span>
                        {selectedTable.tags?.map((tag) => (
                          <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button tone="ghost" disabled={refreshMutation.isPending} onClick={() => refreshMutation.mutate(selectedTable.id)}>
                        {refreshMutation.isPending ? 'Refreshing...' : 'Refresh Metadata'}
                      </Button>
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
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Catalog Governance</p>
                          <h3 className="mt-2 font-display text-2xl text-ink">Ownership, Tags, and Lineage</h3>
                        </div>
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
                      </div>
                      <div className="grid gap-4">
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
                      </div>
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
