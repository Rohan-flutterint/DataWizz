import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowRightLeft, ArrowUp, ChevronDown, ChevronUp, Clock3, Copy, Cpu, DatabaseZap, FileCode2, PencilLine, Play, Plus, SkipForward, Sparkles, Trash2 } from 'lucide-react'
import { type DragEvent, useEffect, useMemo, useState } from 'react'
import { DataTable } from '../components/data-table'
import { MonacoSqlEditor } from '../components/monaco-sql-editor'
import { Button, Input, Label, PageHeader, Panel, Select, Textarea } from '../components/ui'
import { useExecutionEngine } from '../engine/engine-context'
import { saveNotebookChartHandoff } from '../lib/chart-handoff'
import { saveNotebookDatasetHandoff } from '../lib/dataset-handoff'
import { api } from '../lib/api'
import { cn, formatDate } from '../lib/utils'
import { useTheme } from '../theme/theme-context'
import type { DeltaTable, ExecutionEngine, NotebookArtifact, NotebookCell, NotebookCellRunResult, NotebookDocument, NotebookSnippet, UploadedFile } from '../types'
import { useNavigate } from 'react-router-dom'

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
  return { id: cellId, title, kind: 'code', code }
}

function createMarkdownCell(code = '', title?: string): NotebookCell {
  const cellId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `cell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return { id: cellId, title, kind: 'markdown', code }
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

function inferSnippetCategory(cell: NotebookCell, engine: ExecutionEngine | null) {
  if ((cell.kind || 'code') === 'markdown') {
    return 'notes'
  }
  if (engine?.runtime_language === 'python') {
    return 'python'
  }
  return 'sql'
}

function toSnippetDefaultName(cell: NotebookCell, cellIndex: number, entryKind: 'snippet' | 'template') {
  const baseName = cell.title?.trim() || `Cell ${cellIndex + 1}`
  return `${baseName} ${entryKind === 'template' ? 'Template' : 'Snippet'}`
}

function toArtifactName(...parts: Array<string | null | undefined>) {
  const value = parts
    .filter(Boolean)
    .join('_')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return value || 'notebook_output'
}

function inferNotebookSchemaFromResult(result: NotebookCellRunResult) {
  return result.columns.map((column) => {
    const sample = result.rows.find((row) => row[column] !== null && row[column] !== undefined)?.[column]
    let type = 'string'
    if (typeof sample === 'number') type = Number.isInteger(sample) ? 'int64' : 'double'
    else if (typeof sample === 'boolean') type = 'boolean'
    else if (sample instanceof Date) type = 'timestamp'
    return { name: column, type }
  })
}

function renderMarkdownBlocks(markdown: string) {
  return markdown.split('\n').map((rawLine, index) => {
    const line = rawLine.trim()
    if (!line) {
      return <div key={`space-${index}`} className="h-2" />
    }
    if (line.startsWith('### ')) {
      return <h3 key={`h3-${index}`} className="text-lg font-semibold text-ink">{line.slice(4)}</h3>
    }
    if (line.startsWith('## ')) {
      return <h2 key={`h2-${index}`} className="font-display text-2xl text-ink">{line.slice(3)}</h2>
    }
    if (line.startsWith('# ')) {
      return <h1 key={`h1-${index}`} className="font-display text-3xl text-ink">{line.slice(2)}</h1>
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <div key={`li-${index}`} className="flex items-start gap-2 text-sm leading-6 text-slate/80">
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-current" />
          <span>{line.slice(2)}</span>
        </div>
      )
    }
    return (
      <p key={`p-${index}`} className="whitespace-pre-wrap text-sm leading-7 text-slate/80">
        {rawLine}
      </p>
    )
  })
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
  const navigate = useNavigate()
  const { theme } = useTheme()
  const queryClient = useQueryClient()
  const { activeEngineId, setActiveEngineId } = useExecutionEngine()
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null)
  const [draftNotebook, setDraftNotebook] = useState<NotebookDocument | null>(null)
  const [cellResults, setCellResults] = useState<Record<string, NotebookCellRunResult>>({})
  const [collapsedOutputs, setCollapsedOutputs] = useState<Record<string, boolean>>({})
  const [runFeedback, setRunFeedback] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [cellActionState, setCellActionState] = useState<{ cellId: string; mode: 'single' | 'from_here' } | null>(null)
  const [assetTargetCellId, setAssetTargetCellId] = useState<string>('new')
  const [draggingCellId, setDraggingCellId] = useState<string | null>(null)
  const [dropTargetCellId, setDropTargetCellId] = useState<string | null>(null)

  const engineCatalogQuery = useQuery({ queryKey: ['execution-engines'], queryFn: api.listExecutionEngines })
  const notebooksQuery = useQuery({ queryKey: ['notebooks'], queryFn: api.listNotebooks })
  const notebookDetailQuery = useQuery({
    queryKey: ['notebook-detail', selectedNotebookId],
    queryFn: () => api.getNotebook(selectedNotebookId as string),
    enabled: Boolean(selectedNotebookId),
  })
  const notebookSnippetsQuery = useQuery({ queryKey: ['notebook-snippets'], queryFn: api.listNotebookSnippets })
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
  const createNotebookSnippetMutation = useMutation({
    mutationFn: api.createNotebookSnippet,
  })
  const deleteNotebookSnippetMutation = useMutation({
    mutationFn: api.deleteNotebookSnippet,
  })
  const duplicateNotebookMutation = useMutation({
    mutationFn: api.duplicateNotebook,
  })
  const deleteNotebookMutation = useMutation({
    mutationFn: api.deleteNotebook,
  })
  const writeNotebookCellDeltaMutation = useMutation({
    mutationFn: ({ notebookId, cellId, payload }: { notebookId: string; cellId: string; payload: { table_name: string; mode: 'overwrite' | 'append'; schema_name: string; description?: string } }) =>
      api.writeNotebookCellDelta(notebookId, cellId, payload),
  })

  const activeNotebook = draftNotebook
  const hasSelectedNotebook = Boolean(selectedNotebookId)
  const targetableCells = activeNotebook?.cells_json ?? []
  const rawAssets = filesQuery.data?.items ?? []
  const curatedAssets = tablesQuery.data?.items ?? []
  const snippetLibrary = notebookSnippetsQuery.data?.items ?? []

  const resetNotebookDraft = (engineOverride?: ExecutionEngine | null) => {
    setSelectedNotebookId(null)
    setCellResults({})
    setCollapsedOutputs({})
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
        kind: cell.kind || 'code',
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
      setCollapsedOutputs({})
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

  const insertSnippetIntoNotebook = (snippet: string, title: string, cellKind: 'code' | 'markdown' = 'code') => {
    setRunError(null)
    setRunFeedback(null)
    setDraftNotebook((current) => {
      if (!current) return current
      const target = current.cells_json.find((cell) => cell.id === assetTargetCellId)
      const targetKind = target?.kind || 'code'
      if (assetTargetCellId === 'new' || !target || targetKind !== cellKind) {
        const nextCell = cellKind === 'markdown' ? createMarkdownCell(snippet, title) : createCell(snippet, title)
        setAssetTargetCellId(nextCell.id)
        setRunFeedback(
          target && targetKind !== cellKind
            ? `Inserted ${title} into a new ${cellKind} cell because the selected target is a ${targetKind} cell.`
            : `Inserted ${title} into a new notebook cell.`,
        )
        return {
          ...current,
          cells_json: [...current.cells_json, nextCell],
        }
      }
      const nextCode = target?.code?.trim() ? `${target.code.trim()}\n\n${snippet}` : snippet
      setRunFeedback(`Inserted ${title} into ${target?.title || 'the selected cell'}.`)
      return {
        ...current,
        cells_json: current.cells_json.map((cell) => (cell.id === assetTargetCellId ? { ...cell, code: nextCode, kind: cellKind } : cell)),
      }
    })
  }

  const insertSourceSnippet = (sourceName: string, label: string, mode: 'preview' | 'count') => {
    const snippet =
      selectedEngine?.runtime_language === 'python'
        ? buildNotebookPythonSnippet(activeEngineId, sourceName, mode)
        : buildNotebookSqlSnippet(sourceName, mode)
    insertSnippetIntoNotebook(snippet, `${label} ${mode === 'preview' ? 'preview' : 'row count'} snippet`, 'code')
  }

  const insertHelperSnippet = (title: string, snippet: string) => {
    insertSnippetIntoNotebook(snippet, title, 'code')
  }

  const insertSavedLibraryEntry = (entry: NotebookSnippet) => {
    insertSnippetIntoNotebook(entry.code, entry.name, entry.cell_kind)
  }

  const handleSaveCellLibraryEntry = async (cell: NotebookCell, cellIndex: number, entryKind: 'snippet' | 'template') => {
    const suggestedName = toSnippetDefaultName(cell, cellIndex, entryKind)
    const proposedName = window.prompt(entryKind === 'template' ? 'Template name' : 'Snippet name', suggestedName)?.trim()
    if (!proposedName) return
    setRunError(null)
    setRunFeedback(null)
    try {
      const savedEntry = await createNotebookSnippetMutation.mutateAsync({
        name: proposedName,
        description: `${entryKind === 'template' ? 'Reusable template' : 'Reusable snippet'} from ${activeNotebook?.name ?? selectedEngine?.label ?? 'Engine Lab'}`,
        category: inferSnippetCategory(cell, selectedEngine),
        engine_scope: activeEngineId || 'all',
        cell_kind: (cell.kind || 'code') as 'code' | 'markdown',
        code: cell.code,
        is_template: entryKind === 'template',
      })
      await queryClient.invalidateQueries({ queryKey: ['notebook-snippets'] })
      setRunFeedback(`${savedEntry.name} saved to the reusable ${entryKind} library.`)
    } catch (error) {
      setRunError((error as Error).message)
    }
  }

  const handleDeleteSnippet = async (entry: NotebookSnippet) => {
    const confirmed = window.confirm(`Delete ${entry.name} from the reusable library?`)
    if (!confirmed) return
    setRunError(null)
    setRunFeedback(null)
    try {
      await deleteNotebookSnippetMutation.mutateAsync(entry.id)
      await queryClient.invalidateQueries({ queryKey: ['notebook-snippets'] })
      setRunFeedback(`Removed ${entry.name} from the reusable library.`)
    } catch (error) {
      setRunError((error as Error).message)
    }
  }

  const handoffCellResultToChartBuilder = (cell: NotebookCell, result: NotebookCellRunResult) => {
    if (!result.rows.length || !result.columns.length) {
      setRunError('This cell does not have tabular output yet, so there is nothing to hand off to Chart Builder.')
      return
    }
    const cellIndex = activeNotebook?.cells_json.findIndex((item) => item.id === cell.id) ?? -1
    const fallbackCellTitle = cellIndex >= 0 ? `Cell ${cellIndex + 1}` : 'Notebook Cell'
    const numericColumn = result.columns.find((column) =>
      result.rows.some((row) => {
        const value = row[column]
        return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
      }),
    )
    const categoryColumn = result.columns.find((column) => column !== numericColumn) ?? result.columns[0]
    saveNotebookChartHandoff({
      source: 'notebook',
      notebookName: activeNotebook?.name ?? 'Notebook',
      cellId: cell.id,
      cellTitle: cell.title,
      chartName: `${cell.title || fallbackCellTitle} Chart`,
      chartType: 'bar',
      categoryKey: categoryColumn,
      valueKey: numericColumn ?? result.columns[0],
      columns: result.columns,
      rows: result.rows,
    })
    navigate('/bi/charts/new?source=notebook')
  }

  const handoffCellResultToDatasetExplorer = (cell: NotebookCell, result: NotebookCellRunResult) => {
    if (!result.rows.length || !result.columns.length) {
      setRunError('This cell does not have tabular output yet, so there is nothing to hand off to Dataset Explorer.')
      return
    }
    const cellIndex = activeNotebook?.cells_json.findIndex((item) => item.id === cell.id) ?? -1
    const fallbackCellTitle = cellIndex >= 0 ? `Cell ${cellIndex + 1}` : 'Notebook Cell'
    const baseLabel = cell.title?.trim() || fallbackCellTitle
    saveNotebookDatasetHandoff({
      source: 'notebook',
      notebookName: activeNotebook?.name ?? 'Notebook',
      cellId: cell.id,
      cellTitle: cell.title,
      datasetName: `${baseLabel.replace(/[^a-z0-9_]+/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'notebook_result'}_dataset`,
      description: `Notebook snapshot dataset from ${activeNotebook?.name ?? 'Notebook'}${cell.title ? ` · ${cell.title}` : ''}`,
      columns: result.columns,
      rows: result.rows,
      schema_json: inferNotebookSchemaFromResult(result),
    })
    navigate('/bi/datasets?source=notebook')
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

  const downloadNotebookCellArtifact = async (cell: NotebookCell, format: 'csv' | 'parquet') => {
    if (!selectedNotebookId || !activeNotebook) {
      setRunError('Save this notebook before exporting a cell result.')
      return
    }
    setRunError(null)
    setRunFeedback(null)
    try {
      const fileName = toArtifactName(activeNotebook.name, cell.title || cell.id)
      const blob = await api.exportNotebookCell(selectedNotebookId, cell.id, { format, file_name: fileName })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${fileName}.${format}`
      anchor.click()
      window.URL.revokeObjectURL(url)
      setRunFeedback(`${format.toUpperCase()} export started for ${cell.title || cell.id}`)
      await queryClient.invalidateQueries({ queryKey: ['notebook-detail', selectedNotebookId] })
    } catch (error) {
      setRunError((error as Error).message)
    }
  }

  const publishNotebookCellToDelta = async (cell: NotebookCell) => {
    if (!selectedNotebookId || !activeNotebook) {
      setRunError('Save this notebook before publishing a cell result to Delta.')
      return
    }
    const suggestedName = toArtifactName(activeNotebook.name, cell.title || cell.id)
    const tableName = window.prompt('Delta table name', suggestedName)
    if (!tableName) return
    setRunError(null)
    setRunFeedback(null)
    try {
      const response = await writeNotebookCellDeltaMutation.mutateAsync({
        notebookId: selectedNotebookId,
        cellId: cell.id,
        payload: {
          table_name: tableName,
          mode: 'overwrite',
          schema_name: 'analytics',
          description: `Published from notebook ${activeNotebook.name}${cell.title ? ` · ${cell.title}` : ''}`,
        },
      })
      await queryClient.invalidateQueries({ queryKey: ['tables'] })
      await queryClient.invalidateQueries({ queryKey: ['notebook-detail', selectedNotebookId] })
      setRunFeedback(`Notebook result published to Delta as ${response.table.schema_name}.${response.table.name}`)
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
    setCollapsedOutputs((current) => {
      const next = { ...current }
      items.forEach((item) => {
        next[item.cell_id] = false
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
  const activeNotebookArtifacts = notebookDetailQuery.data?.recent_artifacts ?? []
  const filteredSnippetLibrary = snippetLibrary.filter((entry) => entry.engine_scope === 'all' || entry.engine_scope === activeEngineId)
  const templateLibrary = filteredSnippetLibrary.filter((entry) => entry.is_template)
  const snippetEntries = filteredSnippetLibrary.filter((entry) => !entry.is_template)

  const downloadArtifactFromHistory = async (artifact: NotebookArtifact) => {
    try {
      const blob = await api.downloadNotebookArtifact(artifact.id)
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = artifact.download_name || artifact.display_name
      anchor.click()
      window.URL.revokeObjectURL(url)
      setRunFeedback(`Downloaded ${artifact.display_name}`)
      setRunError(null)
    } catch (error) {
      setRunError((error as Error).message)
    }
  }

  const updateNotebookCells = (updater: (cells: NotebookCell[]) => NotebookCell[]) => {
    setDraftNotebook((current) =>
      current
        ? {
            ...current,
            cells_json: updater(current.cells_json),
          }
        : current,
    )
  }

  const moveCell = (cellId: string, direction: 'up' | 'down') => {
    updateNotebookCells((cells) => {
      const index = cells.findIndex((cell) => cell.id === cellId)
      if (index === -1) return cells
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= cells.length) return cells
      const next = [...cells]
      const [cell] = next.splice(index, 1)
      next.splice(targetIndex, 0, cell)
      return next
    })
    setRunFeedback(`Moved ${direction === 'up' ? 'up' : 'down'} the selected cell.`)
    setRunError(null)
  }

  const moveCellToTarget = (draggedCellId: string, targetCellId: string) => {
    if (draggedCellId === targetCellId) return
    updateNotebookCells((cells) => {
      const fromIndex = cells.findIndex((cell) => cell.id === draggedCellId)
      const targetIndex = cells.findIndex((cell) => cell.id === targetCellId)
      if (fromIndex === -1 || targetIndex === -1) return cells
      const next = [...cells]
      const [draggedCell] = next.splice(fromIndex, 1)
      next.splice(targetIndex, 0, draggedCell)
      return next
    })
    setRunFeedback('Reordered notebook cells.')
    setRunError(null)
  }

  const duplicateCell = (cell: NotebookCell, index: number) => {
    const duplicatedCell = createCell(cell.code, cell.title?.trim() ? `${cell.title} Copy` : `Cell ${index + 2}`)
    updateNotebookCells((cells) => {
      const next = [...cells]
      next.splice(index + 1, 0, duplicatedCell)
      return next
    })
    setRunFeedback(`Duplicated ${cell.title?.trim() || `Cell ${index + 1}`}.`)
    setRunError(null)
  }

  const removeCell = (cellId: string) => {
    updateNotebookCells((cells) => cells.filter((item) => item.id !== cellId))
    setCellResults((current) => {
      const next = { ...current }
      delete next[cellId]
      return next
    })
    setCollapsedOutputs((current) => {
      const next = { ...current }
      delete next[cellId]
      return next
    })
    if (assetTargetCellId === cellId) {
      setAssetTargetCellId('new')
    }
  }

  const toggleOutputCollapsed = (cellId: string) => {
    setCollapsedOutputs((current) => ({
      ...current,
      [cellId]: !current[cellId],
    }))
  }

  const handleCellDragStart = (event: DragEvent<HTMLElement>, cellId: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', cellId)
    setDraggingCellId(cellId)
    setDropTargetCellId(cellId)
  }

  const handleCellDragOver = (event: DragEvent<HTMLElement>, cellId: string) => {
    event.preventDefault()
    if (!draggingCellId || draggingCellId === cellId) return
    event.dataTransfer.dropEffect = 'move'
    if (dropTargetCellId !== cellId) {
      setDropTargetCellId(cellId)
    }
  }

  const handleCellDrop = (event: DragEvent<HTMLElement>, targetCellId: string) => {
    event.preventDefault()
    const draggedCellId = draggingCellId || event.dataTransfer.getData('text/plain')
    if (draggedCellId) {
      moveCellToTarget(draggedCellId, targetCellId)
    }
    setDraggingCellId(null)
    setDropTargetCellId(null)
  }

  const handleCellDragEnd = () => {
    setDraggingCellId(null)
    setDropTargetCellId(null)
  }

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

          <Panel>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Recent Artifacts</p>
            <div className="mt-4 space-y-3">
              {activeNotebookArtifacts.length ? (
                activeNotebookArtifacts.map((artifact) => (
                  <div key={artifact.id} className={cn('rounded-2xl border p-4', theme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink">{artifact.display_name}</p>
                        <p className="mt-1 text-sm text-slate/75">{artifact.cell_title || artifact.cell_id} · {artifact.row_count ?? 0} rows</p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]',
                          artifact.artifact_kind === 'delta_publish'
                            ? theme === 'dark'
                              ? 'bg-cyan-500/15 text-cyan-300'
                              : 'bg-cyan-100 text-lagoon'
                            : theme === 'dark'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-emerald-100 text-emerald-700',
                        )}
                      >
                        {artifact.artifact_kind.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate/60">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDate(artifact.created_at)}
                    </div>
                    <p className="mt-3 break-all text-xs text-slate/60">{artifact.storage_path}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {artifact.artifact_kind === 'delta_publish' && artifact.delta_table_id ? (
                        <Button tone="ghost" onClick={() => navigate(`/catalog?tableId=${encodeURIComponent(artifact.delta_table_id || '')}`)}>
                          Open in Catalog
                        </Button>
                      ) : (
                        <Button tone="ghost" onClick={() => { void downloadArtifactFromHistory(artifact) }}>
                          Download Again
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate/75">Exported files and Delta publishes from this notebook will appear here.</p>
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
              <Button
                tone="ghost"
                onClick={() =>
                  setDraftNotebook((current) =>
                    current
                      ? {
                          ...current,
                          cells_json: [...current.cells_json, createMarkdownCell('# Notes\n\nAdd context, assumptions, or analysis here.', `Notes ${current.cells_json.length + 1}`)],
                        }
                      : current,
                  )
                }
              >
                <PencilLine className="mr-2 h-4 w-4" />
                Add Markdown
              </Button>
              <Button tone="ghost" onClick={() => selectedEngine && setDraftNotebook((current) => (current ? { ...current, cells_json: [createCell(selectedEngine.sample_code, 'Starter cell')] } : current))}>
                Load Engine Sample
              </Button>
              <Button tone="ghost" onClick={() => {
                setCellResults({})
                setCollapsedOutputs({})
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

          <Panel>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Reusable Library</p>
                <h3 className="mt-2 font-display text-2xl text-ink">Saved snippets and templates</h3>
              </div>
              <div className={cn('rounded-full px-3 py-1 text-xs font-semibold', theme === 'dark' ? 'bg-white/5 text-white/60' : 'bg-slate-100 text-slate/70')}>
                {filteredSnippetLibrary.length} available for {selectedEngine?.label ?? 'this engine'}
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate/75">
              Save working notebook cells into a reusable library, then inject them into any future notebook without rebuilding the same setup each time.
            </p>
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <div className={cn('rounded-2xl border p-4', theme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50')}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">Templates</p>
                    <p className="mt-1 text-sm text-slate/75">Longer starter cells and notebook scaffolds.</p>
                  </div>
                  <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]', theme === 'dark' ? 'bg-[#f6f24a]/15 text-[#f6f24a]' : 'bg-[#fff4bf] text-[#7a6500]')}>
                    {templateLibrary.length}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {templateLibrary.length ? templateLibrary.map((entry) => (
                    <div key={entry.id} className={cn('rounded-2xl border p-4', theme === 'dark' ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-white')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{entry.name}</p>
                          <p className="mt-1 text-sm text-slate/75">{entry.description || 'Reusable notebook template'}</p>
                        </div>
                        <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]', theme === 'dark' ? 'bg-[#f6f24a]/15 text-[#f6f24a]' : 'bg-[#fff4bf] text-[#7a6500]')}>
                          template
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', theme === 'dark' ? 'bg-white/5 text-white/60' : 'bg-slate-100 text-slate-500')}>
                          {entry.category}
                        </span>
                        <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', theme === 'dark' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-lagoon')}>
                          {entry.cell_kind}
                        </span>
                        <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', theme === 'dark' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700')}>
                          {entry.engine_scope}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button tone="ghost" onClick={() => insertSavedLibraryEntry(entry)}>
                          Insert
                        </Button>
                        <Button tone="ghost" onClick={() => void handleDeleteSnippet(entry)} disabled={deleteNotebookSnippetMutation.isPending}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  )) : <p className="text-sm text-slate/75">Save a cell as a template to build your reusable starter library.</p>}
                </div>
              </div>
              <div className={cn('rounded-2xl border p-4', theme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50')}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">Snippets</p>
                    <p className="mt-1 text-sm text-slate/75">Focused helpers for joins, profiling, notes, and repeatable queries.</p>
                  </div>
                  <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]', theme === 'dark' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700')}>
                    {snippetEntries.length}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {snippetEntries.length ? snippetEntries.map((entry) => (
                    <div key={entry.id} className={cn('rounded-2xl border p-4', theme === 'dark' ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-white')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{entry.name}</p>
                          <p className="mt-1 text-sm text-slate/75">{entry.description || 'Reusable notebook snippet'}</p>
                        </div>
                        <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]', theme === 'dark' ? 'bg-white/5 text-white/60' : 'bg-slate-100 text-slate-500')}>
                          snippet
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', theme === 'dark' ? 'bg-white/5 text-white/60' : 'bg-slate-100 text-slate-500')}>
                          {entry.category}
                        </span>
                        <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', theme === 'dark' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-lagoon')}>
                          {entry.cell_kind}
                        </span>
                        <span className={cn('rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', theme === 'dark' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700')}>
                          {entry.engine_scope}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button tone="ghost" onClick={() => insertSavedLibraryEntry(entry)}>
                          Insert
                        </Button>
                        <Button tone="ghost" onClick={() => void handleDeleteSnippet(entry)} disabled={deleteNotebookSnippetMutation.isPending}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  )) : <p className="text-sm text-slate/75">Save a code or markdown cell as a reusable snippet to start building your shared notebook kit.</p>}
                </div>
              </div>
            </div>
          </Panel>

          {activeNotebook?.cells_json?.map((cell, index) => {
            const result = cellResults[cell.id]
            const outputCollapsed = collapsedOutputs[cell.id] ?? false
            const cellKind = cell.kind || 'code'
            const isMarkdownCell = cellKind === 'markdown'
            return (
              <Panel
                key={cell.id}
                className={cn(
                  'space-y-4 p-0 transition',
                  draggingCellId === cell.id
                    ? theme === 'dark'
                      ? 'opacity-70 ring-1 ring-[#f6f24a]/25'
                      : 'opacity-80 ring-1 ring-cyan-200'
                    : '',
                  dropTargetCellId === cell.id && draggingCellId !== cell.id
                    ? theme === 'dark'
                      ? 'ring-2 ring-[#f6f24a]/45'
                      : 'ring-2 ring-lagoon/30'
                    : '',
                )}
                onDragOver={(event) => handleCellDragOver(event, cell.id)}
                onDrop={(event) => handleCellDrop(event, cell.id)}
              >
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition',
                          !isMarkdownCell
                            ? theme === 'dark'
                              ? 'bg-cyan-500/15 text-cyan-300'
                              : 'bg-cyan-100 text-lagoon'
                            : theme === 'dark'
                              ? 'bg-white/5 text-white/55 hover:bg-white/10'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                        )}
                        onClick={() =>
                          updateNotebookCells((cells) =>
                            cells.map((item) => (item.id === cell.id ? { ...item, kind: 'code' } : item)),
                          )
                        }
                      >
                        Code
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition',
                          isMarkdownCell
                            ? theme === 'dark'
                              ? 'bg-[#f6f24a]/15 text-[#f6f24a]'
                              : 'bg-[#fff4bf] text-[#7a6500]'
                            : theme === 'dark'
                              ? 'bg-white/5 text-white/55 hover:bg-white/10'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                        )}
                        onClick={() =>
                          updateNotebookCells((cells) =>
                            cells.map((item) => (item.id === cell.id ? { ...item, kind: 'markdown' } : item)),
                          )
                        }
                      >
                        Markdown
                      </button>
                    </div>
                  </div>
                  <div className="ml-4 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => handleCellDragStart(event, cell.id)}
                      onDragEnd={handleCellDragEnd}
                      className={cn('cursor-grab rounded-lg p-2 transition active:cursor-grabbing', theme === 'dark' ? 'text-white/55 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900')}
                      title="Drag to reorder cell"
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                    </button>
                    {result ? (
                      <span className={cn('rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]', result.status === 'success' ? (theme === 'dark' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700') : theme === 'dark' ? 'bg-rose-500/15 text-rose-300' : 'bg-rose-100 text-rose-700')}>
                        {result.status}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className={cn('rounded-lg p-2 transition', theme === 'dark' ? 'text-white/55 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900')}
                      onClick={() => moveCell(cell.id, 'up')}
                      disabled={index === 0}
                      title="Move cell up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={cn('rounded-lg p-2 transition', theme === 'dark' ? 'text-white/55 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900')}
                      onClick={() => moveCell(cell.id, 'down')}
                      disabled={index === (activeNotebook.cells_json.length ?? 0) - 1}
                      title="Move cell down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={cn('rounded-lg p-2 transition', theme === 'dark' ? 'text-white/55 hover:bg-white/5 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900')}
                      onClick={() => duplicateCell(cell, index)}
                      title="Duplicate cell"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <Button
                      tone="ghost"
                      disabled={createNotebookSnippetMutation.isPending}
                      onClick={() => {
                        void handleSaveCellLibraryEntry(cell, index, 'snippet')
                      }}
                    >
                      Save Snippet
                    </Button>
                    <Button
                      tone="ghost"
                      disabled={createNotebookSnippetMutation.isPending}
                      onClick={() => {
                        void handleSaveCellLibraryEntry(cell, index, 'template')
                      }}
                    >
                      Save Template
                    </Button>
                    <Button
                      tone="ghost"
                      disabled={isMarkdownCell || !selectedEngine?.available || runNotebookMutation.isPending || createNotebookMutation.isPending || updateNotebookMutation.isPending || Boolean(cellActionState)}
                      onClick={() => {
                        void handleRunCellAction(cell.id, 'single')
                      }}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      {cellActionState?.cellId === cell.id && cellActionState.mode === 'single' ? 'Running...' : 'Run Cell'}
                    </Button>
                    <Button
                      tone="ghost"
                      disabled={isMarkdownCell || !selectedEngine?.available || runNotebookMutation.isPending || createNotebookMutation.isPending || updateNotebookMutation.isPending || Boolean(cellActionState)}
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
                      onClick={() => removeCell(cell.id)}
                      disabled={(activeNotebook.cells_json.length ?? 0) <= 1}
                      title="Delete cell"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {isMarkdownCell ? (
                  <div className="space-y-4 px-5 py-5">
                    <Textarea
                      rows={10}
                      value={cell.code}
                      onChange={(event) =>
                        setDraftNotebook((current) =>
                          current
                            ? {
                                ...current,
                                cells_json: current.cells_json.map((item) => (item.id === cell.id ? { ...item, code: event.target.value } : item)),
                              }
                            : current,
                        )
                      }
                      placeholder="# Title&#10;&#10;Write notes, assumptions, or analysis for this notebook section."
                    />
                    <div className={cn('rounded-2xl border p-4', theme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50')}>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Rendered Markdown</p>
                      <div className="mt-4 space-y-3">
                        {renderMarkdownBlocks(cell.code)}
                      </div>
                    </div>
                  </div>
                ) : (
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
                )}

                {result && !isMarkdownCell ? (
                  <div className={cn('space-y-4 border-t px-5 py-5', theme === 'dark' ? 'border-white/10' : 'border-slate-100')}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Cell Output</p>
                        <h4 className="mt-2 font-display text-2xl text-ink">
                          {result.row_count} rows · {result.execution_ms} ms
                        </h4>
                        {result.message ? <p className="mt-2 max-w-3xl text-sm text-slate/75">{result.message}</p> : null}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          tone="ghost"
                          onClick={() => {
                            void downloadNotebookCellArtifact(cell, 'csv')
                          }}
                          disabled={!selectedNotebookId || !result.columns.length}
                        >
                          Export CSV
                        </Button>
                        <Button
                          tone="ghost"
                          onClick={() => {
                            void downloadNotebookCellArtifact(cell, 'parquet')
                          }}
                          disabled={!selectedNotebookId || !result.columns.length}
                        >
                          Export Parquet
                        </Button>
                        <Button
                          tone="ghost"
                          onClick={() => {
                            void publishNotebookCellToDelta(cell)
                          }}
                          disabled={!selectedNotebookId || !result.columns.length || writeNotebookCellDeltaMutation.isPending}
                        >
                          {writeNotebookCellDeltaMutation.isPending ? 'Publishing...' : 'Publish to Delta'}
                        </Button>
                        <Button
                          tone="ghost"
                          onClick={() => handoffCellResultToChartBuilder(cell, result)}
                          disabled={!result.rows.length}
                        >
                          Open in Chart Builder
                        </Button>
                        <Button
                          tone="ghost"
                          onClick={() => handoffCellResultToDatasetExplorer(cell, result)}
                          disabled={!result.rows.length}
                        >
                          Open in Dataset Explorer
                        </Button>
                        <Button tone="ghost" onClick={() => toggleOutputCollapsed(cell.id)}>
                          {outputCollapsed ? (
                            <>
                              <ChevronDown className="mr-2 h-4 w-4" />
                              Expand Output
                            </>
                          ) : (
                            <>
                              <ChevronUp className="mr-2 h-4 w-4" />
                              Collapse Output
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {!outputCollapsed && result.warnings.length ? (
                      <div className={cn('rounded-2xl border p-4 text-sm', theme === 'dark' ? 'border-orange-500/20 bg-orange-500/10 text-orange-200' : 'border-orange-200 bg-orange-50 text-orange-700')}>
                        <p className="font-semibold">Runtime notes</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {result.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {!outputCollapsed && result.stdout ? (
                      <div className={cn('rounded-2xl p-4 font-mono text-sm text-emerald-300', theme === 'dark' ? 'bg-black' : 'bg-slate-950')}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/70">Stdout</p>
                        <pre className="whitespace-pre-wrap">{result.stdout}</pre>
                      </div>
                    ) : null}

                    {outputCollapsed ? (
                      <div className={cn('rounded-2xl border px-4 py-3 text-sm', theme === 'dark' ? 'border-white/10 bg-white/[0.03] text-white/70' : 'border-slate-200 bg-slate-50 text-slate-700')}>
                        Output collapsed. This cell still has {result.row_count} rows available from the last run.
                      </div>
                    ) : result.rows.length ? (
                      <DataTable columns={result.columns} rows={result.rows} />
                    ) : null}
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
