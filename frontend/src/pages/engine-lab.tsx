import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, Clock3, Copy, Cpu, DatabaseZap, FileCode2, PencilLine, Play, Plus, SkipForward, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DataTable } from '../components/data-table'
import { MonacoSqlEditor } from '../components/monaco-sql-editor'
import { Button, Input, Label, PageHeader, Panel, Select, Textarea } from '../components/ui'
import { useExecutionEngine } from '../engine/engine-context'
import { api } from '../lib/api'
import { cn, formatDate } from '../lib/utils'
import { useTheme } from '../theme/theme-context'
import type { DeltaTable, ExecutionEngine, NotebookCell, NotebookCellRunResult, NotebookDocument, UploadedFile } from '../types'

function capabilityPill(enabled: boolean, label: string, theme: 'light' | 'dark') {
  return (
    <span
      key={label}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-semibold',
        enabled
          ? theme === 'dark'
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'bg-emerald-100 text-emerald-700'
          : theme === 'dark'
            ? 'bg-white/5 text-white/35'
            : 'bg-slate-100 text-slate-500',
      )}
    >
      {label}
    </span>
  )
}

function createCell(code = '', title?: string): NotebookCell {
  const cellId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `cell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return { id: cellId, title, code }
}

function toRawViewName(fileName: string) {
  return `raw_${fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')}`
}

function toQualifiedTableName(table: DeltaTable) {
  return table.schema_name ? `${table.schema_name}.${table.name}` : table.name
}

function buildNotebookSqlSnippet(sourceName: string, mode: 'preview' | 'count') {
  if (mode === 'count') {
    return `SELECT COUNT(*) AS row_count\nFROM ${sourceName}`
  }
  return `SELECT *\nFROM ${sourceName}\nLIMIT 25`
}

function buildNotebookPythonSnippet(engineId: string, sourceName: string, mode: 'preview' | 'count') {
  const sql = buildNotebookSqlSnippet(sourceName, mode)
  if (engineId === 'spark') {
    return `result = spark.sql("""\n${sql}\n""")\nresult.show(25, truncate=False)`
  }
  return `result = ctx.sql("""\n${sql}\n""")\nprint("Query prepared in DataFusion")`
}

function buildWriteDeltaHelperSnippet(engineId: string) {
  if (engineId === 'duckdb') {
    return `SELECT *\nFROM sales_curated\nLIMIT 25`
  }
  return `write_info = write_delta(\n    result=result,\n    table_name="curated_notebook_output",\n    mode="overwrite",\n)\nprint(write_info["table"]["name"])`
}

function buildDefaultNotebook(engine: ExecutionEngine | null): NotebookDocument | null {
  if (!engine) return null
  return {
    id: '',
    name: `${engine.label} Playground`,
    engine_id: engine.id,
    description: `Exploratory ${engine.label} notebook for the local lakehouse sources.`,
    cells_json: [createCell(engine.sample_code, 'Starter cell')],
    latest_cell_results_json: [],
    last_run_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export function EngineLabPage() {
  const { theme } = useTheme()
  const queryClient = useQueryClient()
  const { activeEngineId, setActiveEngineId } = useExecutionEngine()
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null)
  const [draftNotebook, setDraftNotebook] = useState<NotebookDocument | null>(null)
  const [cellResults, setCellResults] = useState<Record<string, NotebookCellRunResult>>({})
  const [runFeedback, setRunFeedback] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [cellActionState, setCellActionState] = useState<{ cellId: string; mode: 'single' | 'from_here' } | null>(null)
  const [assetTargetCellId, setAssetTargetCellId] = useState<string>('new')

  const engineCatalogQuery = useQuery({ queryKey: ['execution-engines'], queryFn: api.listExecutionEngines })
  const notebooksQuery = useQuery({ queryKey: ['notebooks'], queryFn: api.listNotebooks })
  const notebookDetailQuery = useQuery({
    queryKey: ['notebook-detail', selectedNotebookId],
    queryFn: () => api.getNotebook(selectedNotebookId as string),
    enabled: Boolean(selectedNotebookId),
  })
  const filesQuery = useQuery({ queryKey: ['files'], queryFn: api.listFiles })
  const tablesQuery = useQuery({ queryKey: ['tables'], queryFn: api.listTables })

  const engines = engineCatalogQuery.data?.items ?? []
  const selectedEngine = useMemo<ExecutionEngine | null>(
    () => engines.find((engine) => engine.id === activeEngineId) ?? engines[0] ?? null,
    [activeEngineId, engines],
  )

  useEffect(() => {
    if (!engineCatalogQuery.data) return
    if (!engines.find((engine) => engine.id === activeEngineId)) {
      setActiveEngineId(engineCatalogQuery.data.default_engine)
    }
  }, [activeEngineId, engineCatalogQuery.data, engines, setActiveEngineId])

  useEffect(() => {
    if (selectedNotebookId || draftNotebook || !selectedEngine) return
    setDraftNotebook(buildDefaultNotebook(selectedEngine))
  }, [draftNotebook, selectedEngine, selectedNotebookId])

  useEffect(() => {
    const detail = notebookDetailQuery.data
    if (!detail) return
    setDraftNotebook(detail.notebook)
    setActiveEngineId(detail.notebook.engine_id)
    const latestCellResults = detail.notebook.latest_cell_results_json ?? []
    const nextResults: Record<string, NotebookCellRunResult> = {}
    latestCellResults.forEach((item) => {
      nextResults[item.cell_id] = item
    })
    setCellResults(nextResults)
  }, [notebookDetailQuery.data, setActiveEngineId])

  useEffect(() => {
    if (!draftNotebook?.cells_json?.length) {
      setAssetTargetCellId('new')
      return
    }
    if (assetTargetCellId === 'new') return
    const targetExists = draftNotebook.cells_json.some((cell) => cell.id === assetTargetCellId)
    if (!targetExists) {
      setAssetTargetCellId(draftNotebook.cells_json[0].id)
    }
  }, [assetTargetCellId, draftNotebook])

  const createNotebookMutation = useMutation({
    mutationFn: api.createNotebook,
  })

  const updateNotebookMutation = useMutation({
    mutationFn: ({ notebookId, payload }: { notebookId: string; payload: Parameters<typeof api.updateNotebook>[1] }) => api.updateNotebook(notebookId, payload),
  })

  const runNotebookMutation = useMutation({
    mutationFn: api.runNotebook,
  })
  const runCellMutation = useMutation({
    mutationFn: ({ notebookId, cellId }: { notebookId: string; cellId: string }) => api.runNotebookCell(notebookId, cellId),
  })
  const runFromCellMutation = useMutation({
    mutationFn: ({ notebookId, cellId }: { notebookId: string; cellId: string }) => api.runNotebookFromCell(notebookId, cellId),
  })
  const duplicateNotebookMutation = useMutation({
    mutationFn: api.duplicateNotebook,
  })
  const deleteNotebookMutation = useMutation({
    mutationFn: api.deleteNotebook,
  })

  const activeNotebook = draftNotebook
  const hasSelectedNotebook = Boolean(selectedNotebookId)
  const targetableCells = activeNotebook?.cells_json ?? []
  const rawAssets = filesQuery.data?.items ?? []
  const curatedAssets = tablesQuery.data?.items ?? []

  const resetNotebookDraft = (engineOverride?: ExecutionEngine | null) => {
    setSelectedNotebookId(null)
    setCellResults({})
    setRunFeedback(null)
    setRunError(null)
    setDraftNotebook(buildDefaultNotebook(engineOverride ?? selectedEngine))
    setAssetTargetCellId('new')
  }

  const persistNotebook = async () => {
    if (!activeNotebook) return null
    const payload = {
      name: activeNotebook.name.trim() || `${selectedEngine?.label ?? 'Notebook'} Playground`,
      engine_id: activeEngineId,
      description: activeNotebook.description ?? '',
      cells_json: activeNotebook.cells_json.map((cell) => ({
        id: cell.id,
        title: cell.title || '',
        code: cell.code,
      })),
    }
    const saved = selectedNotebookId
      ? await updateNotebookMutation.mutateAsync({ notebookId: selectedNotebookId, payload })
      : await createNotebookMutation.mutateAsync(payload)
    await queryClient.invalidateQueries({ queryKey: ['notebooks'] })
    await queryClient.invalidateQueries({ queryKey: ['notebook-detail', saved.id] })
    setSelectedNotebookId(saved.id)
    setDraftNotebook(saved)
    return saved
  }

  const handleDuplicateNotebook = async (notebookId: string) => {
    setRunError(null)
    setRunFeedback(null)
    try {
      const duplicate = await duplicateNotebookMutation.mutateAsync(notebookId)
      await queryClient.invalidateQueries({ queryKey: ['notebooks'] })
      await queryClient.invalidateQueries({ queryKey: ['notebook-detail', duplicate.id] })
      setSelectedNotebookId(duplicate.id)
      setDraftNotebook(duplicate)
      setCellResults({})
      setRunFeedback(`Duplicated notebook as ${duplicate.name}`)
    } catch (error) {
      setRunError((error as Error).message)
    }
  }

  const handleDeleteNotebook = async (notebook: NotebookDocument) => {
    const confirmed = window.confirm(`Delete notebook "${notebook.name}"? This will also remove its run history.`)
    if (!confirmed) return
    setRunError(null)
    setRunFeedback(null)
    try {
      await deleteNotebookMutation.mutateAsync(notebook.id)
      await queryClient.invalidateQueries({ queryKey: ['notebooks'] })
      await queryClient.removeQueries({ queryKey: ['notebook-detail', notebook.id] })
      if (selectedNotebookId === notebook.id) {
        resetNotebookDraft(selectedEngine)
      }
      setRunFeedback(`Deleted notebook ${notebook.name}`)
    } catch (error) {
      setRunError((error as Error).message)
    }
  }

  const insertSnippetIntoNotebook = (snippet: string, title: string) => {
    setRunError(null)
    setRunFeedback(null)
    setDraftNotebook((current) => {
      if (!current) return current
      if (assetTargetCellId === 'new' || !current.cells_json.some((cell) => cell.id === assetTargetCellId)) {
        const nextCell = createCell(snippet, title)
        setAssetTargetCellId(nextCell.id)
        setRunFeedback(`Inserted ${title} into a new notebook cell.`)
        return {
          ...current,
          cells_json: [...current.cells_json, nextCell],
        }
      }
      const target = current.cells_json.find((cell) => cell.id === assetTargetCellId)
      const nextCode = target?.code?.trim() ? `${target.code.trim()}\n\n${snippet}` : snippet
      setRunFeedback(`Inserted ${title} into ${target?.title || 'the selected cell'}.`)
      return {
        ...current,
        cells_json: current.cells_json.map((cell) => (cell.id === assetTargetCellId ? { ...cell, code: nextCode } : cell)),
      }
    })
  }

  const insertSourceSnippet = (sourceName: string, label: string, mode: 'preview' | 'count') => {
    const snippet =
      selectedEngine?.runtime_language === 'python'
        ? buildNotebookPythonSnippet(activeEngineId, sourceName, mode)
        : buildNotebookSqlSnippet(sourceName, mode)
    insertSnippetIntoNotebook(snippet, `${label} ${mode === 'preview' ? 'preview' : 'row count'} snippet`)
  }

  const insertHelperSnippet = (title: string, snippet: string) => {
    insertSnippetIntoNotebook(snippet, title)
  }

  const handleRunNotebook = async () => {
    setRunError(null)
    setRunFeedback(null)
    try {
      const saved = await persistNotebook()
      if (!saved) return
      const result = await runNotebookMutation.mutateAsync(saved.id)
      const nextResults: Record<string, NotebookCellRunResult> = {}
      result.cell_results.forEach((item) => {
        nextResults[item.cell_id] = item
      })
      setCellResults(nextResults)
      setRunFeedback(`Notebook run completed successfully in ${result.run.duration_ms ?? 0} ms`)
      await queryClient.invalidateQueries({ queryKey: ['notebook-detail', saved.id] })
      await queryClient.invalidateQueries({ queryKey: ['notebooks'] })
    } catch (error) {
      setRunError((error as Error).message)
    }
  }

  const mergeCellResults = (items: NotebookCellRunResult[]) => {
    setCellResults((current) => {
      const next = { ...current }
      items.forEach((item) => {
        next[item.cell_id] = item
      })
      return next
    })
  }

  const handleRunCellAction = async (cellId: string, mode: 'single' | 'from_here') => {
    setRunError(null)
    setRunFeedback(null)
    setCellActionState({ cellId, mode })
    try {
      const saved = await persistNotebook()
      if (!saved) return
      const result =
        mode === 'single'
          ? await runCellMutation.mutateAsync({ notebookId: saved.id, cellId })
          : await runFromCellMutation.mutateAsync({ notebookId: saved.id, cellId })
      mergeCellResults(result.cell_results)
      setRunFeedback(
        mode === 'single'
          ? `Cell run completed successfully in ${result.run.duration_ms ?? 0} ms`
          : `Notebook rerun from this cell completed successfully in ${result.run.duration_ms ?? 0} ms`,
      )
      await queryClient.invalidateQueries({ queryKey: ['notebook-detail', saved.id] })
      await queryClient.invalidateQueries({ queryKey: ['notebooks'] })
    } catch (error) {
      setRunError((error as Error).message)
    } finally {
      setCellActionState(null)
    }
  }

  const activeNotebookRuns = notebookDetailQuery.data?.recent_runs ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Engine Lab"
        title="Notebook Runtime Workspace"
        description="Create saved multi-cell notebooks for DuckDB, Spark, or DataFusion, run them against the local lakehouse sources, and keep a persistent run history just like an internal analytics workspace."
        actions={
          <>
            <Button
              tone="ghost"
              onClick={() => {
                resetNotebookDraft(selectedEngine)
              }}
            >
              New Notebook
            </Button>
            <Button
              tone="ghost"
              disabled={!hasSelectedNotebook || duplicateNotebookMutation.isPending}
              onClick={() => {
                if (selectedNotebookId) {
                  void handleDuplicateNotebook(selectedNotebookId)
                }
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              {duplicateNotebookMutation.isPending ? 'Duplicating...' : 'Duplicate'}
            </Button>
            <Button
              tone="ghost"
              disabled={!activeNotebook || createNotebookMutation.isPending || updateNotebookMutation.isPending}
              onClick={() => {
                void persistNotebook()
              }}
            >
              {createNotebookMutation.isPending || updateNotebookMutation.isPending ? 'Saving...' : 'Save Notebook'}
            </Button>
            <Button
              tone="ghost"
              disabled={!hasSelectedNotebook || deleteNotebookMutation.isPending}
              onClick={() => {
                if (selectedNotebookId && activeNotebook) {
                  void handleDeleteNotebook(activeNotebook)
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteNotebookMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
            <Button
              disabled={!activeNotebook || !selectedEngine || !selectedEngine.available || runNotebookMutation.isPending}
              onClick={() => {
                void handleRunNotebook()
              }}
            >
              {runNotebookMutation.isPending ? 'Running...' : 'Run All Cells'}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[0.78fr_1.5fr]">
        <div className="space-y-5">
          <Panel>
            <div className="flex items-center gap-3">
              <div className={cn('rounded-2xl p-3', theme === 'dark' ? 'bg-white/5 text-white/80' : 'bg-slate-100 text-slate-700')}>
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Active Engine</p>
                <h2 className="font-display text-2xl text-ink">{selectedEngine?.label ?? 'Loading engines...'}</h2>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {engines.map((engine) => {
                const isActive = engine.id === activeEngineId
                return (
                  <button
                    key={engine.id}
                    type="button"
                    onClick={() => {
                      setActiveEngineId(engine.id)
                      setDraftNotebook((current) => {
                        if (!current) return buildDefaultNotebook(engine)
                        return current.id ? { ...current, engine_id: engine.id } : { ...current, engine_id: engine.id, cells_json: current.cells_json.length ? current.cells_json : [createCell(engine.sample_code, 'Starter cell')] }
                      })
                    }}
                    className={cn(
                      'w-full rounded-2xl border p-4 text-left transition',
                      isActive
                        ? theme === 'dark'
                          ? 'border-[#f6f24a]/35 bg-[#181818]'
                          : 'border-[#ff3621] bg-[#fff1ef]'
                        : theme === 'dark'
                          ? 'border-white/10 bg-white/[0.03] hover:border-white/20'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-ink">{engine.label}</p>
                        <p className="mt-1 text-sm text-slate/75">{engine.summary}</p>
                      </div>
                      <span
                        className={cn(
                          'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]',
                          engine.available
                            ? theme === 'dark'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-emerald-100 text-emerald-700'
                            : theme === 'dark'
                              ? 'bg-orange-500/15 text-orange-300'
                              : 'bg-orange-100 text-orange-700',
                        )}
                      >
                        {engine.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {capabilityPill(engine.supports_sql, 'SQL', theme)}
                      {capabilityPill(engine.supports_python, 'Python', theme)}
                      {capabilityPill(engine.supports_local_files, 'Local Files', theme)}
                      {capabilityPill(engine.supports_delta_read, 'Delta Read', theme)}
                      {capabilityPill(engine.supports_delta_write, 'Delta Write', theme)}
                    </div>
                    {!engine.available && engine.availability_reason ? (
                      <p className={cn('mt-3 text-sm', theme === 'dark' ? 'text-orange-300' : 'text-orange-700')}>{engine.availability_reason}</p>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Notebook Library</p>
                <h3 className="mt-2 font-display text-2xl text-ink">Saved notebooks</h3>
              </div>
              <Button tone="ghost" onClick={() => {
                resetNotebookDraft(selectedEngine)
              }}>
                <Plus className="mr-2 h-4 w-4" />
                New
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {notebooksQuery.data?.items?.length ? (
                notebooksQuery.data.items.map((notebook) => (
                  <button
                    key={notebook.id}
                    type="button"
                    onClick={() => {
                      setSelectedNotebookId(notebook.id)
                      setRunFeedback(null)
                      setRunError(null)
                    }}
                    className={cn(
                      'w-full rounded-2xl border p-4 text-left transition',
                      selectedNotebookId === notebook.id
                        ? theme === 'dark'
                          ? 'border-[#f6f24a]/35 bg-[#181818]'
                          : 'border-cyan-200 bg-cyan-50'
                        : theme === 'dark'
                          ? 'border-white/10 bg-white/[0.03] hover:border-white/20'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-ink">{notebook.name}</p>
                        <p className="mt-1 text-sm text-slate/75">{notebook.cells_json.length} cell(s) · {notebook.engine_id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]', theme === 'dark' ? 'bg-white/5 text-white/55' : 'bg-white text-slate-500')}>
                          {notebook.last_run_at ? 'Run' : 'Saved'}
                        </span>
                        <button
                          type="button"
                          aria-label={`Duplicate ${notebook.name}`}
                          className={cn(
                            'rounded-full border p-2 transition',
                            theme === 'dark'
                              ? 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.06]'
                              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700',
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleDuplicateNotebook(notebook.id)
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${notebook.name}`}
                          className={cn(
                            'rounded-full border p-2 transition',
                            theme === 'dark'
                              ? 'border-rose-500/20 bg-rose-500/10 text-rose-300 hover:border-rose-500/35 hover:bg-rose-500/15'
                              : 'border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100',
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleDeleteNotebook(notebook)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate/60">
                      Updated {formatDate(notebook.updated_at)}
                      {notebook.last_run_at ? ` · Last run ${formatDate(notebook.last_run_at)}` : ''}
                    </p>
                  </button>
                ))
              ) : (
                <p className="text-sm text-slate/75">No notebooks saved yet. Start with a new notebook and save it to keep it in the library.</p>
              )}
            </div>
          </Panel>

          <Panel>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Recent Runs</p>
            <div className="mt-4 space-y-3">
              {activeNotebookRuns.length ? (
                activeNotebookRuns.map((run) => (
                  <div key={run.id} className={cn('rounded-2xl border p-4', theme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50')}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-ink">{run.status}</p>
                      <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]', run.status === 'success' ? (theme === 'dark' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700') : theme === 'dark' ? 'bg-rose-500/15 text-rose-300' : 'bg-rose-100 text-rose-700')}>
                        {run.engine_id}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate/60">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDate(run.created_at)} · {run.duration_ms ?? 0} ms
                    </div>
                    {run.error_message ? <p className="mt-3 text-sm text-rose-500">{run.error_message}</p> : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate/75">Run history appears here after you execute a saved notebook.</p>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div>
                <Label>Notebook Name</Label>
                <Input
                  value={activeNotebook?.name ?? ''}
                  onChange={(event) => setDraftNotebook((current) => (current ? { ...current, name: event.target.value } : current))}
                  placeholder="Revenue Investigation Notebook"
                />
                <div className="mt-2 flex items-center gap-2 text-xs text-slate/60">
                  <PencilLine className="h-3.5 w-3.5" />
                  <span>
                    {selectedNotebookId
                      ? 'Rename by editing the title here, then click Save Notebook.'
                      : 'This is a draft notebook until you save it to the library.'}
                  </span>
                </div>
              </div>
              <div>
                <Label>Runtime</Label>
                <div className={cn('rounded-lg border px-3.5 py-2.5 text-sm font-medium', theme === 'dark' ? 'border-white/10 bg-white/[0.03] text-white/80' : 'border-slate-200 bg-slate-50 text-slate-700')}>
                  {selectedEngine?.label ?? 'Loading engine'}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={activeNotebook?.description ?? ''}
                onChange={(event) => setDraftNotebook((current) => (current ? { ...current, description: event.target.value } : current))}
                placeholder="Describe what this notebook is modeling or publishing."
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                tone="ghost"
                onClick={() =>
                  setDraftNotebook((current) =>
                    current
                      ? {
                          ...current,
                          cells_json: [...current.cells_json, createCell('', `Cell ${current.cells_json.length + 1}`)],
                        }
                      : current,
                  )
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Cell
              </Button>
              <Button tone="ghost" onClick={() => selectedEngine && setDraftNotebook((current) => (current ? { ...current, cells_json: [createCell(selectedEngine.sample_code, 'Starter cell')] } : current))}>
                Load Engine Sample
              </Button>
              <Button tone="ghost" onClick={() => {
                setCellResults({})
                setRunFeedback(null)
                setRunError(null)
              }}>
                Clear Outputs
              </Button>
              {selectedNotebookId ? (
                <Button
                  tone="ghost"
                  disabled={duplicateNotebookMutation.isPending}
                  onClick={() => {
                    void handleDuplicateNotebook(selectedNotebookId)
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate Notebook
                </Button>
              ) : null}
            </div>
          </Panel>

          {runError ? (
            <Panel className={cn(theme === 'dark' ? 'border-rose-500/25 bg-rose-500/10 text-rose-200' : 'border-rose-200 bg-rose-50 text-rose-700')}>
              <p className="font-semibold">Notebook run failed</p>
              <p className="mt-2 text-sm leading-6">{runError}</p>
            </Panel>
          ) : null}
          {runFeedback ? (
            <Panel className={cn(theme === 'dark' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
              <p className="font-semibold">Run completed</p>
              <p className="mt-2 text-sm leading-6">{runFeedback}</p>
            </Panel>
          ) : null}

          <Panel>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Notebook Asset Browser</p>
                <h3 className="mt-2 font-display text-2xl text-ink">Insert source-aware snippets</h3>
              </div>
              <div className={cn('rounded-full px-3 py-1 text-xs font-semibold', theme === 'dark' ? 'bg-white/5 text-white/60' : 'bg-slate-100 text-slate/70')}>
                {rawAssets.length} raw · {curatedAssets.length} curated
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <div className={cn('rounded-2xl border p-4', theme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50')}>
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className={cn('h-4 w-4', theme === 'dark' ? 'text-white/50' : 'text-slate-500')} />
                  <p className="font-semibold text-ink">Insertion Target</p>
                </div>
                <p className="mt-2 text-sm text-slate/75">Choose whether new notebook snippets should land in a specific existing cell or create a fresh cell automatically.</p>
                <div className="mt-4">
                  <Label>Target cell</Label>
                  <Select value={assetTargetCellId} onChange={(event) => setAssetTargetCellId(event.target.value)}>
                    <option value="new">Create a new cell</option>
                    {targetableCells.map((cell, index) => (
                      <option key={cell.id} value={cell.id}>
                        {cell.title?.trim() || `Cell ${index + 1}`}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="mt-4 rounded-2xl border border-dashed px-4 py-3 text-sm text-slate/70" style={theme === 'dark' ? { borderColor: 'rgba(255,255,255,0.1)' } : undefined}>
                  Snippets are engine-aware for {selectedEngine?.label ?? 'the selected runtime'}. SQL cells get plain SQL, while Spark and DataFusion notebooks get runnable Python helpers.
                </div>
              </div>
              <div className={cn('rounded-2xl p-4', theme === 'dark' ? 'bg-white/[0.03]' : 'bg-slate-50')}>
                <div className="flex items-center gap-2">
                  <FileCode2 className={cn('h-4 w-4', theme === 'dark' ? 'text-white/50' : 'text-slate-500')} />
                  <p className="font-semibold text-ink">Raw Views</p>
                </div>
                <div className="mt-3 space-y-3">
                  {rawAssets.length ? rawAssets.map((file: UploadedFile) => {
                    const sourceName = toRawViewName(file.name)
                    return (
                      <div key={file.id} className={cn('rounded-2xl border p-4', theme === 'dark' ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-white')}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-ink">{sourceName}</p>
                            <p className="mt-1 text-sm text-slate/75">{file.name} · {file.file_type.toUpperCase()} · {file.row_count ?? 'unknown'} rows</p>
                          </div>
                          <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]', theme === 'dark' ? 'bg-white/5 text-white/60' : 'bg-slate-100 text-slate-500')}>
                            raw
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button tone="ghost" onClick={() => insertSourceSnippet(sourceName, sourceName, 'preview')}>
                            Insert Preview
                          </Button>
                          <Button tone="ghost" onClick={() => insertSourceSnippet(sourceName, sourceName, 'count')}>
                            Insert Count
                          </Button>
                        </div>
                      </div>
                    )
                  }) : <p className="text-sm text-slate/75">Upload a file to expose a raw notebook view.</p>}
                </div>
              </div>
              <div className={cn('rounded-2xl p-4', theme === 'dark' ? 'bg-white/[0.03]' : 'bg-slate-50')}>
                <div className="flex items-center gap-2">
                  <DatabaseZap className={cn('h-4 w-4', theme === 'dark' ? 'text-white/50' : 'text-slate-500')} />
                  <p className="font-semibold text-ink">Curated Tables</p>
                </div>
                <div className="mt-3 space-y-3">
                  {curatedAssets.length ? curatedAssets.map((table: DeltaTable) => {
                    const sourceName = toQualifiedTableName(table)
                    return (
                      <div key={table.id} className={cn('rounded-2xl border p-4', theme === 'dark' ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-white')}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-ink">{sourceName}</p>
                            <p className="mt-1 text-sm text-slate/75">{table.row_count ?? 'unknown'} rows · {table.mode} · {table.storage_path}</p>
                          </div>
                          <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]', theme === 'dark' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-lagoon')}>
                            delta
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button tone="ghost" onClick={() => insertSourceSnippet(sourceName, sourceName, 'preview')}>
                            Insert Preview
                          </Button>
                          <Button tone="ghost" onClick={() => insertSourceSnippet(sourceName, sourceName, 'count')}>
                            Insert Count
                          </Button>
                        </div>
                      </div>
                    )
                  }) : <p className="text-sm text-slate/75">Curated Delta outputs will appear here after a write.</p>}
                </div>
              </div>
              <div className={cn('rounded-2xl p-4 lg:col-span-2', theme === 'dark' ? 'bg-white/[0.03]' : 'bg-slate-50')}>
                <div className="flex items-center gap-2">
                  <Sparkles className={cn('h-4 w-4', theme === 'dark' ? 'text-white/50' : 'text-slate-500')} />
                  <p className="font-semibold text-ink">Notebook Helpers</p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <button
                    type="button"
                    className={cn('rounded-2xl border p-4 text-left transition', theme === 'dark' ? 'border-white/10 bg-black/20 hover:border-white/20' : 'border-slate-200 bg-white hover:border-slate-300')}
                    onClick={() => insertHelperSnippet('Revenue by region helper', selectedEngine?.sample_code ?? '')}
                  >
                    <p className="font-semibold text-ink">Insert Engine Sample</p>
                    <p className="mt-2 text-sm text-slate/75">Drop the runtime’s starter pattern into your notebook with one click.</p>
                  </button>
                  <button
                    type="button"
                    className={cn('rounded-2xl border p-4 text-left transition', theme === 'dark' ? 'border-white/10 bg-black/20 hover:border-white/20' : 'border-slate-200 bg-white hover:border-slate-300')}
                    onClick={() => insertHelperSnippet('Join template helper', selectedEngine?.runtime_language === 'python'
                      ? buildNotebookPythonSnippet(activeEngineId, `${rawAssets[0] ? toRawViewName(rawAssets[0].name) : 'raw_source_a'} a JOIN ${rawAssets[1] ? toRawViewName(rawAssets[1].name) : 'raw_source_b'} b ON a.id = b.id`, 'preview')
                      : `SELECT *\nFROM ${rawAssets[0] ? toRawViewName(rawAssets[0].name) : 'raw_source_a'} a\nJOIN ${rawAssets[1] ? toRawViewName(rawAssets[1].name) : 'raw_source_b'} b\n  ON a.id = b.id\nLIMIT 25`)}
                  >
                    <p className="font-semibold text-ink">Insert Join Template</p>
                    <p className="mt-2 text-sm text-slate/75">Start a multi-source enrichment step without hand-writing the skeleton.</p>
                  </button>
                  <button
                    type="button"
                    className={cn('rounded-2xl border p-4 text-left transition', theme === 'dark' ? 'border-white/10 bg-black/20 hover:border-white/20' : 'border-slate-200 bg-white hover:border-slate-300')}
                    onClick={() => insertHelperSnippet('Delta write helper', buildWriteDeltaHelperSnippet(activeEngineId))}
                  >
                    <p className="font-semibold text-ink">Insert Delta Write Helper</p>
                    <p className="mt-2 text-sm text-slate/75">Use the built-in notebook publishing helper to write the current result back to Delta Lake.</p>
                  </button>
                </div>
              </div>
            </div>
          </Panel>

          {activeNotebook?.cells_json?.map((cell, index) => {
            const result = cellResults[cell.id]
            return (
              <Panel key={cell.id} className="space-y-4 p-0">
                <div className={cn('flex items-center justify-between border-b px-5 py-4', theme === 'dark' ? 'border-white/10' : 'border-slate-100')}>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Cell {index + 1}</p>
                    <Input
                      value={cell.title ?? ''}
                      onChange={(event) =>
                        setDraftNotebook((current) =>
                          current
                            ? {
                                ...current,
                                cells_json: current.cells_json.map((item) => (item.id === cell.id ? { ...item, title: event.target.value } : item)),
                              }
                            : current,
                        )
                      }
                      placeholder={`Cell ${index + 1} title`}
                      className="mt-3"
                    />
                  </div>
                  <div className="ml-4 flex items-center gap-3">
                    {result ? (
                      <span className={cn('rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]', result.status === 'success' ? (theme === 'dark' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700') : theme === 'dark' ? 'bg-rose-500/15 text-rose-300' : 'bg-rose-100 text-rose-700')}>
                        {result.status}
                      </span>
                    ) : null}
                    <Button
                      tone="ghost"
                      disabled={!selectedEngine?.available || runNotebookMutation.isPending || createNotebookMutation.isPending || updateNotebookMutation.isPending || Boolean(cellActionState)}
                      onClick={() => {
                        void handleRunCellAction(cell.id, 'single')
                      }}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      {cellActionState?.cellId === cell.id && cellActionState.mode === 'single' ? 'Running...' : 'Run Cell'}
                    </Button>
                    <Button
                      tone="ghost"
                      disabled={!selectedEngine?.available || runNotebookMutation.isPending || createNotebookMutation.isPending || updateNotebookMutation.isPending || Boolean(cellActionState)}
                      onClick={() => {
                        void handleRunCellAction(cell.id, 'from_here')
                      }}
                    >
                      <SkipForward className="mr-2 h-4 w-4" />
                      {cellActionState?.cellId === cell.id && cellActionState.mode === 'from_here' ? 'Running...' : 'Run From Here'}
                    </Button>
                    <button
                      type="button"
                      className={cn('rounded-lg p-2 transition', theme === 'dark' ? 'text-white/55 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900')}
                      onClick={() =>
                        setDraftNotebook((current) =>
                          current
                            ? {
                                ...current,
                                cells_json: current.cells_json.filter((item) => item.id !== cell.id),
                              }
                            : current,
                        )
                      }
                      disabled={(activeNotebook.cells_json.length ?? 0) <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <MonacoSqlEditor
                  value={cell.code}
                  onChange={(value) =>
                    setDraftNotebook((current) =>
                      current
                        ? {
                            ...current,
                            cells_json: current.cells_json.map((item) => (item.id === cell.id ? { ...item, code: value } : item)),
                          }
                        : current,
                    )
                  }
                  height={240}
                  language={selectedEngine?.runtime_language === 'python' ? 'python' : 'sql'}
                />

                {result ? (
                  <div className={cn('space-y-4 border-t px-5 py-5', theme === 'dark' ? 'border-white/10' : 'border-slate-100')}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Cell Output</p>
                        <h4 className="mt-2 font-display text-2xl text-ink">
                          {result.row_count} rows · {result.execution_ms} ms
                        </h4>
                        {result.message ? <p className="mt-2 max-w-3xl text-sm text-slate/75">{result.message}</p> : null}
                      </div>
                    </div>

                    {result.warnings.length ? (
                      <div className={cn('rounded-2xl border p-4 text-sm', theme === 'dark' ? 'border-orange-500/20 bg-orange-500/10 text-orange-200' : 'border-orange-200 bg-orange-50 text-orange-700')}>
                        <p className="font-semibold">Runtime notes</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {result.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {result.stdout ? (
                      <div className={cn('rounded-2xl p-4 font-mono text-sm text-emerald-300', theme === 'dark' ? 'bg-black' : 'bg-slate-950')}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/70">Stdout</p>
                        <pre className="whitespace-pre-wrap">{result.stdout}</pre>
                      </div>
                    ) : null}

                    {result.rows.length ? <DataTable columns={result.columns} rows={result.rows} /> : null}
                  </div>
                ) : null}
              </Panel>
            )
          })}
        </div>
      </div>
    </div>
  )
}
