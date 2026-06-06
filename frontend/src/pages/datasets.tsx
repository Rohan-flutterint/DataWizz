import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DataTable } from '../components/data-table'
import { Button, EmptyState, Input, Label, PageHeader, Panel, Select, Textarea } from '../components/ui'
import { api } from '../lib/api'
import { clearNotebookDatasetHandoff, readNotebookDatasetHandoff, type NotebookDatasetHandoff } from '../lib/dataset-handoff'
import { formatDate } from '../lib/utils'

type ExplorerSelection =
  | { kind: 'candidate'; id: string }
  | { kind: 'dataset'; id: string }
  | { kind: 'notebook_candidate'; id: string }

function inferDimensions(schema: { name: string; type: string }[] = []) {
  return schema
    .filter((field) => !/(int|float|double|decimal|bool)/i.test(field.type))
    .map((field) => ({ name: field.name, label: field.name, type: field.type }))
}

function inferMetrics(schema: { name: string; type: string }[] = []) {
  return schema
    .filter((field) => /(int|float|double|decimal)/i.test(field.type))
    .map((field) => ({ name: `${field.name}_sum`, expression: `SUM(${field.name})`, format: 'number' }))
}

function parseJsonArray(value: string, fallback: unknown[] = []) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function DatasetsPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const datasetsQuery = useQuery({ queryKey: ['bi', 'datasets'], queryFn: api.listDatasets })
  const [selection, setSelection] = useState<ExplorerSelection | null>(null)
  const [search, setSearch] = useState('')
  const [datasetName, setDatasetName] = useState('')
  const [datasetDescription, setDatasetDescription] = useState('')
  const [dimensionsText, setDimensionsText] = useState('[]')
  const [metricsText, setMetricsText] = useState('[]')
  const [statusMessage, setStatusMessage] = useState('Select a curated candidate or an existing semantic dataset to inspect it.')
  const [notebookHandoff, setNotebookHandoff] = useState<NotebookDatasetHandoff | null>(null)

  const candidates = datasetsQuery.data?.candidates ?? []
  const datasets = datasetsQuery.data?.items ?? []
  const notebookCandidate =
    notebookHandoff
      ? {
          id: `notebook:${notebookHandoff.cellId}`,
          name: notebookHandoff.datasetName,
          schema_name: 'notebook_snapshot',
          source_type: 'notebook_snapshot',
          source_ref: `notebook:${notebookHandoff.notebookName}:${notebookHandoff.cellId}`,
          description: notebookHandoff.description ?? `Snapshot captured from ${notebookHandoff.notebookName}${notebookHandoff.cellTitle ? ` · ${notebookHandoff.cellTitle}` : ''}`,
          schema_json: notebookHandoff.schema_json,
          row_count: notebookHandoff.rows.length,
          updated_at: new Date().toISOString(),
        }
      : null

  const filteredCandidates = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const mergedCandidates = notebookCandidate ? [notebookCandidate, ...candidates] : candidates
    return mergedCandidates.filter((candidate) => {
      if (!needle) return true
      return (
        candidate.name.toLowerCase().includes(needle) ||
        (candidate.schema_name ?? '').toLowerCase().includes(needle) ||
        (candidate.description ?? '').toLowerCase().includes(needle)
      )
    })
  }, [candidates, notebookCandidate, search])

  const filteredDatasets = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return datasets.filter((dataset) => {
      if (!needle) return true
      return (
        dataset.name.toLowerCase().includes(needle) ||
        dataset.source_ref.toLowerCase().includes(needle) ||
        (dataset.description ?? '').toLowerCase().includes(needle)
      )
    })
  }, [datasets, search])

  useEffect(() => {
    const handoff = readNotebookDatasetHandoff()
    if (handoff) {
      setNotebookHandoff(handoff)
    }
  }, [])

  useEffect(() => {
    const requestedDatasetId = searchParams.get('datasetId')
    if (requestedDatasetId && datasets.some((dataset) => dataset.id === requestedDatasetId)) {
      setSelection((current) =>
        current?.kind === 'dataset' && current.id === requestedDatasetId
          ? current
          : { kind: 'dataset', id: requestedDatasetId },
      )
      return
    }

    const requestedCandidateId = searchParams.get('candidateId')
    if (requestedCandidateId && candidates.some((candidate) => candidate.id === requestedCandidateId)) {
      setSelection((current) =>
        current?.kind === 'candidate' && current.id === requestedCandidateId
          ? current
          : { kind: 'candidate', id: requestedCandidateId },
      )
      return
    }

    if (searchParams.get('source') === 'notebook' && notebookCandidate) {
      setSelection((current) =>
        current?.kind === 'notebook_candidate' && current.id === notebookCandidate.id
          ? current
          : { kind: 'notebook_candidate', id: notebookCandidate.id },
      )
      return
    }

    if (selection) return
    if (filteredCandidates[0]) {
      setSelection({
        kind: filteredCandidates[0].source_type === 'notebook_snapshot' ? 'notebook_candidate' : 'candidate',
        id: filteredCandidates[0].id,
      })
      return
    }
    if (filteredDatasets[0]) {
      setSelection({ kind: 'dataset', id: filteredDatasets[0].id })
    }
  }, [candidates, datasets, filteredCandidates, filteredDatasets, notebookCandidate, searchParams, selection])

  const selectedCandidate = selection?.kind === 'candidate' ? candidates.find((candidate) => candidate.id === selection.id) ?? null : null
  const selectedNotebookCandidate = selection?.kind === 'notebook_candidate' && notebookCandidate?.id === selection.id ? notebookCandidate : null
  const selectedDataset = selection?.kind === 'dataset' ? datasets.find((dataset) => dataset.id === selection.id) ?? null : null

  const selectedSchema = selectedNotebookCandidate?.schema_json ?? selectedCandidate?.schema_json ?? selectedDataset?.schema_json ?? []
  const selectedSourceType = selectedNotebookCandidate?.source_type ?? selectedCandidate?.source_type ?? selectedDataset?.source_type ?? ''
  const selectedUpdatedAt = selectedNotebookCandidate?.updated_at ?? selectedCandidate?.updated_at ?? selectedDataset?.updated_at

  useEffect(() => {
    const activeCandidate = selectedNotebookCandidate ?? selectedCandidate
    if (activeCandidate) {
      const inferredDimensions = inferDimensions(activeCandidate.schema_json ?? [])
      const inferredMetrics = inferMetrics(activeCandidate.schema_json ?? [])
      setDatasetName(activeCandidate.name)
      setDatasetDescription(activeCandidate.description ?? `Semantic dataset built from ${activeCandidate.source_type} source ${activeCandidate.name}.`)
      setDimensionsText(JSON.stringify(inferredDimensions, null, 2))
      setMetricsText(JSON.stringify(inferredMetrics, null, 2))
      setStatusMessage(
        activeCandidate.source_type === 'notebook_snapshot'
          ? `Preparing notebook snapshot dataset draft for ${activeCandidate.name}.`
          : `Preparing semantic dataset draft for ${activeCandidate.name}.`,
      )
    } else if (selectedDataset) {
      setDatasetName(selectedDataset.name)
      setDatasetDescription(selectedDataset.description ?? '')
      setDimensionsText(JSON.stringify(selectedDataset.dimensions_json ?? [], null, 2))
      setMetricsText(JSON.stringify(selectedDataset.metrics_json ?? [], null, 2))
      setStatusMessage(`Inspecting existing semantic dataset ${selectedDataset.name}.`)
    }
  }, [selectedCandidate, selectedDataset, selectedNotebookCandidate])

  const candidatePreviewQuery = useQuery({
    queryKey: ['bi', 'datasets', 'candidate-preview', selectedCandidate?.id],
    queryFn: () => api.previewDatasetCandidate(selectedCandidate!.id),
    enabled: Boolean(selectedCandidate),
  })

  const datasetPreviewQuery = useQuery({
    queryKey: ['bi', 'datasets', 'preview', selectedDataset?.id],
    queryFn: () => api.previewDataset(selectedDataset!.id),
    enabled: Boolean(selectedDataset),
  })

  const notebookPreview = selectedNotebookCandidate
    ? {
        columns: notebookHandoff?.columns ?? [],
        rows: notebookHandoff?.rows ?? [],
        row_count: notebookHandoff?.rows.length ?? 0,
        schema_json: notebookHandoff?.schema_json ?? [],
      }
    : null
  const preview = selectedNotebookCandidate ? notebookPreview : selectedCandidate ? candidatePreviewQuery.data : datasetPreviewQuery.data

  const createDatasetMutation = useMutation({
    mutationFn: api.createDataset,
    onSuccess: (dataset, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bi', 'datasets'] })
      setSelection({ kind: 'dataset', id: dataset.id })
      setDatasetName(dataset.name)
      clearNotebookDatasetHandoff()
      setNotebookHandoff(null)
      setStatusMessage(
        dataset.name === variables.name
          ? `Registered semantic dataset ${dataset.name}.`
          : `Registered semantic dataset as ${dataset.name} because that name was already used.`,
      )
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })
  const updateDatasetMutation = useMutation({
    mutationFn: async (payload: { id: string; body: Record<string, unknown> }) => api.updateDataset(payload.id, payload.body),
    onSuccess: (dataset) => {
      queryClient.invalidateQueries({ queryKey: ['bi', 'datasets'] })
      setSelection({ kind: 'dataset', id: dataset.id })
      setDatasetName(dataset.name)
      setStatusMessage(`Updated semantic dataset ${dataset.name}.`)
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  const canRegister = Boolean((selectedCandidate || selectedNotebookCandidate) && datasetName.trim())

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Semantic Layer"
        title="Dataset Explorer"
        description="Inspect curated Delta sources, preview their rows, and shape semantic datasets with reusable dimensions and metrics before charting."
      />

      <Panel className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr_1.3fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Search</p>
          <Input className="mt-3" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search candidates and datasets" />
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate/75">
          <p className="font-semibold text-ink">Dataset Modeling Flow</p>
          <p className="mt-2 leading-6">Choose a curated Delta candidate, preview its rows, shape dimensions and metrics, then register it as a reusable semantic dataset for charts.</p>
        </div>
        <div className="rounded-2xl bg-cyan-50 p-4 text-sm text-lagoon">
          <p className="font-semibold">Explorer Status</p>
          <p className="mt-2 leading-6">{statusMessage}</p>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[330px_330px_minmax(0,1fr)]">
        <Panel>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-ink">Curated Candidates</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate/65">{filteredCandidates.length}</span>
          </div>
          <div className="mt-4 space-y-3">
            {filteredCandidates.length ? (
              filteredCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() =>
                    setSelection({
                      kind: candidate.source_type === 'notebook_snapshot' ? 'notebook_candidate' : 'candidate',
                      id: candidate.id,
                    })
                  }
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    ((selection?.kind === 'candidate' || selection?.kind === 'notebook_candidate') && selection.id === candidate.id) ? 'border-lagoon bg-cyan-50/70 shadow-sm' : 'border-slate-100 bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-ink">{candidate.name}</p>
                      <p className="mt-1 text-sm text-slate/70">{candidate.schema_name || 'analytics'} • {candidate.row_count ?? 0} rows</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/60">Delta</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate/65">{candidate.description || 'Curated Delta table available for semantic registration.'}</p>
                </button>
              ))
            ) : (
              <EmptyState title="No candidates found" description="Curated Delta tables will appear here after you publish them from SQL or pipelines." />
            )}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-ink">Semantic Datasets</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate/65">{filteredDatasets.length}</span>
          </div>
          <div className="mt-4 space-y-3">
            {filteredDatasets.length ? (
              filteredDatasets.map((dataset) => (
                <button
                  key={dataset.id}
                  type="button"
                  onClick={() => setSelection({ kind: 'dataset', id: dataset.id })}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selection?.kind === 'dataset' && selection.id === dataset.id ? 'border-lagoon bg-cyan-50/70 shadow-sm' : 'border-slate-100 bg-slate-50/80'
                  }`}
                >
                  <p className="break-words font-semibold text-ink">{dataset.name}</p>
                  <p className="mt-2 text-sm text-slate/70">{dataset.source_type} • {dataset.source_ref}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate/60">
                    <span>{dataset.schema_json?.length ?? 0} columns</span>
                    <span>•</span>
                    <span>{dataset.metrics_json?.length ?? 0} metrics</span>
                    <span>•</span>
                    <span>{dataset.dimensions_json?.length ?? 0} dimensions</span>
                  </div>
                </button>
              ))
            ) : (
              <EmptyState title="No semantic datasets yet" description="Register a candidate from the left to create reusable BI-friendly datasets." />
            )}
          </div>
        </Panel>

        <div className="space-y-5">
          {selectedCandidate || selectedDataset ? (
            <>
              <Panel className="space-y-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">
                      {selectedNotebookCandidate ? 'Notebook Snapshot Candidate' : selectedCandidate ? 'Candidate Dataset' : 'Semantic Dataset'}
                    </p>
                    <h2 className="mt-2 break-words font-display text-3xl text-ink">{selectedNotebookCandidate?.name || selectedCandidate?.name || selectedDataset?.name}</h2>
                    <p className="mt-3 text-sm leading-6 text-slate/70">
                      {selectedNotebookCandidate?.description || selectedCandidate?.description || selectedDataset?.description || 'Inspect schema and model reusable semantic metadata for downstream charts and dashboards.'}
                    </p>
                  </div>
                  <span className="shrink-0 self-start whitespace-nowrap rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-lagoon">
                    {selectedNotebookCandidate || selectedCandidate ? 'Ready to register' : 'Registered'}
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)]">
                  <div className="min-w-0 rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Source</p>
                    <p className="mt-2 break-all text-sm font-semibold text-ink">{selectedNotebookCandidate?.source_ref || selectedCandidate?.source_ref || selectedDataset?.source_ref}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Columns</p>
                    <p className="mt-2 text-sm font-semibold text-ink">{selectedSchema.length}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Rows</p>
                    <p className="mt-2 text-sm font-semibold text-ink">{preview?.row_count ?? selectedCandidate?.row_count ?? 0}</p>
                  </div>
                </div>

                {selectedNotebookCandidate || selectedCandidate || selectedDataset ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <Label>Dataset Name</Label>
                      <Input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} placeholder="sales_curated_dataset" />
                    </div>
                    <div>
                      <Label>Source Type</Label>
                      <Select value={selectedSourceType} disabled>
                        <option value={selectedSourceType}>{selectedSourceType}</option>
                      </Select>
                    </div>
                    <div className="lg:col-span-2">
                      <Label>Description</Label>
                      <Textarea rows={4} value={datasetDescription} onChange={(event) => setDatasetDescription(event.target.value)} />
                    </div>
                    <div>
                      <Label>Dimensions JSON</Label>
                      <Textarea rows={10} value={dimensionsText} onChange={(event) => setDimensionsText(event.target.value)} />
                    </div>
                    <div>
                      <Label>Metrics JSON</Label>
                      <Textarea rows={10} value={metricsText} onChange={(event) => setMetricsText(event.target.value)} />
                    </div>
                  </div>
                ) : null}

                {selectedNotebookCandidate || selectedCandidate ? (
                  <Button
                    disabled={!canRegister || createDatasetMutation.isPending}
                    onClick={() =>
                      (() => {
                        const sourceCandidate = selectedNotebookCandidate || selectedCandidate
                        if (!sourceCandidate) return
                        createDatasetMutation.mutate({
                          name: datasetName.trim(),
                          source_type: sourceCandidate.source_type,
                          source_ref: sourceCandidate.source_ref,
                          source_config_json:
                            sourceCandidate.source_type === 'notebook_snapshot' && notebookHandoff
                              ? {
                                  notebook_name: notebookHandoff.notebookName,
                                  cell_id: notebookHandoff.cellId,
                                  cell_title: notebookHandoff.cellTitle ?? null,
                                  snapshot_columns: notebookHandoff.columns,
                                  snapshot_rows: notebookHandoff.rows,
                                  snapshot_schema: notebookHandoff.schema_json,
                                }
                              : null,
                          description: datasetDescription.trim() || null,
                          schema_json: sourceCandidate.schema_json ?? [],
                          dimensions_json: parseJsonArray(dimensionsText),
                          metrics_json: parseJsonArray(metricsText),
                        })
                      })()
                    }
                  >
                    {createDatasetMutation.isPending ? 'Registering...' : 'Register Semantic Dataset'}
                  </Button>
                ) : selectedDataset ? (
                  <Button
                    disabled={updateDatasetMutation.isPending}
                    onClick={() =>
                      updateDatasetMutation.mutate({
                        id: selectedDataset.id,
                        body: {
                          name: datasetName.trim(),
                          source_type: selectedDataset.source_type,
                          source_ref: selectedDataset.source_ref,
                          source_config_json: selectedDataset.source_config_json ?? null,
                          description: datasetDescription.trim() || null,
                          schema_json: selectedDataset.schema_json ?? [],
                          dimensions_json: parseJsonArray(dimensionsText),
                          metrics_json: parseJsonArray(metricsText),
                        },
                      })
                    }
                  >
                    {updateDatasetMutation.isPending ? 'Saving...' : 'Save Dataset Changes'}
                  </Button>
                ) : null}
              </Panel>

              <div className="grid gap-5 xl:grid-cols-[0.8fr_minmax(0,1.2fr)]">
                <Panel>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Schema Definition</p>
                  <div className="mt-4 space-y-3">
                    {selectedSchema.map((field, index) => (
                      <div key={`${field.name}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div>
                          <p className="font-semibold text-ink">{field.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate/50">Column {index + 1}</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate">{field.type}</span>
                      </div>
                    ))}
                  </div>
                  {selectedUpdatedAt ? (
                    <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate/50">
                      Updated {formatDate(selectedUpdatedAt)}
                    </p>
                  ) : null}
                </Panel>

                <div className="space-y-4">
                  <Panel className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Dataset Preview</p>
                      <h3 className="mt-2 font-display text-2xl text-ink">{preview?.rows.length ?? 0} sample rows</h3>
                    </div>
                    <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-lagoon">Semantic ready</span>
                  </Panel>
                  {preview ? (
                    <DataTable columns={preview.columns} rows={preview.rows} />
                  ) : (
                    <Panel>
                      <p className="text-sm text-slate/70">Preview rows will appear here after the source dataset is loaded.</p>
                    </Panel>
                  )}
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="Select a dataset source" description="Choose a curated candidate or an existing semantic dataset to preview it and define BI-friendly metadata." />
          )}
        </div>
      </div>
    </div>
  )
}
