import { useMutation, useQuery } from '@tanstack/react-query'
import { Cpu, DatabaseZap, FileCode2, Play, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DataTable } from '../components/data-table'
import { MonacoSqlEditor } from '../components/monaco-sql-editor'
import { Button, PageHeader, Panel } from '../components/ui'
import { useExecutionEngine } from '../engine/engine-context'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { useTheme } from '../theme/theme-context'
import type { ExecutionEngine } from '../types'

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

export function EngineLabPage() {
  const { theme } = useTheme()
  const { activeEngineId, setActiveEngineId } = useExecutionEngine()
  const [draftsByEngine, setDraftsByEngine] = useState<Record<string, string>>({})
  const engineCatalogQuery = useQuery({ queryKey: ['execution-engines'], queryFn: api.listExecutionEngines })
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
    if (!selectedEngine) return
    setDraftsByEngine((current) => {
      if (current[selectedEngine.id]) return current
      return { ...current, [selectedEngine.id]: selectedEngine.sample_code }
    })
  }, [selectedEngine])

  const notebookMutation = useMutation({
    mutationFn: api.executeNotebook,
  })

  const currentCode = selectedEngine ? draftsByEngine[selectedEngine.id] ?? selectedEngine.sample_code : ''

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Engine Lab"
        title="Notebook Runtime Workspace"
        description="Select the processing engine you want to target, then execute SQL or notebook-style code against the available lakehouse sources. DuckDB runs live today, while Spark and DataFusion surface real runtime readiness from the backend."
        actions={
          <>
            {selectedEngine ? (
              <Button
                tone="ghost"
                onClick={() => setDraftsByEngine((current) => ({ ...current, [selectedEngine.id]: selectedEngine.sample_code }))}
              >
                Load Sample
              </Button>
            ) : null}
            <Button
              disabled={!selectedEngine || !selectedEngine.available || notebookMutation.isPending}
              onClick={() =>
                selectedEngine &&
                notebookMutation.mutate({
                  engine_id: selectedEngine.id,
                  code: draftsByEngine[selectedEngine.id] ?? selectedEngine.sample_code,
                  limit: 200,
                })
              }
            >
              {notebookMutation.isPending ? 'Running...' : 'Run Notebook Cell'}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.5fr]">
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
                const isActive = engine.id === selectedEngine?.id
                return (
                  <button
                    key={engine.id}
                    type="button"
                    onClick={() => setActiveEngineId(engine.id)}
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
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Registered Sources</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <div className={cn('rounded-2xl p-4', theme === 'dark' ? 'bg-white/[0.03]' : 'bg-slate-50')}>
                <div className="flex items-center gap-2">
                  <FileCode2 className={cn('h-4 w-4', theme === 'dark' ? 'text-white/50' : 'text-slate-500')} />
                  <p className="font-semibold text-ink">Raw Views</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {filesQuery.data?.items?.length ? (
                    filesQuery.data.items.map((file) => (
                      <span
                        key={file.id}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-medium',
                          theme === 'dark' ? 'bg-white/10 text-white/75' : 'bg-slate-200 text-slate-700',
                        )}
                      >
                        raw_{file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-slate/75">Upload files in File Explorer to expose raw notebook sources.</p>
                  )}
                </div>
              </div>
              <div className={cn('rounded-2xl p-4', theme === 'dark' ? 'bg-white/[0.03]' : 'bg-slate-50')}>
                <div className="flex items-center gap-2">
                  <DatabaseZap className={cn('h-4 w-4', theme === 'dark' ? 'text-white/50' : 'text-slate-500')} />
                  <p className="font-semibold text-ink">Curated Tables</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tablesQuery.data?.items?.length ? (
                    tablesQuery.data.items.map((table) => (
                      <span
                        key={table.id}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-medium',
                          theme === 'dark' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-lagoon',
                        )}
                      >
                        {table.name}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-slate/75">Write a Delta table first to expose curated notebook sources.</p>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel className="space-y-4 p-0">
            <div className={cn('flex items-center justify-between border-b px-5 py-4', theme === 'dark' ? 'border-white/10' : 'border-slate-100')}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Notebook Cell</p>
                <h2 className="font-display text-2xl text-ink">{selectedEngine?.runtime_language === 'python' ? 'Python Runtime' : 'SQL Runtime'}</h2>
              </div>
              <div
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  theme === 'dark' ? 'bg-white/5 text-white/60' : 'bg-slate-100 text-slate/70',
                )}
              >
                {selectedEngine ? `${selectedEngine.vendor} · ${selectedEngine.runtime_language.toUpperCase()}` : 'Loading'}
              </div>
            </div>
            <MonacoSqlEditor
              value={currentCode}
              onChange={(value) => selectedEngine && setDraftsByEngine((current) => ({ ...current, [selectedEngine.id]: value }))}
              height={360}
              language={selectedEngine?.runtime_language === 'python' ? 'python' : 'sql'}
            />
            {selectedEngine?.description ? (
              <div className={cn('border-t px-5 py-4 text-sm text-slate/75', theme === 'dark' ? 'border-white/10' : 'border-slate-100')}>
                {selectedEngine.description}
              </div>
            ) : null}
          </Panel>

          {notebookMutation.error ? (
            <Panel
              className={cn(
                theme === 'dark' ? 'border-rose-500/25 bg-rose-500/10 text-rose-200' : 'border-rose-200 bg-rose-50 text-rose-700',
              )}
            >
              <p className="font-semibold">Execution failed</p>
              <p className="mt-2 text-sm leading-6">{(notebookMutation.error as Error).message}</p>
            </Panel>
          ) : null}

          {notebookMutation.data ? (
            <div className="space-y-4">
              <Panel>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Notebook Output</p>
                    <h3 className="mt-2 font-display text-2xl text-ink">
                      {notebookMutation.data.result.engine_label} completed in {notebookMutation.data.result.execution_ms} ms
                    </h3>
                    {notebookMutation.data.result.message ? <p className="mt-2 max-w-3xl text-sm text-slate/75">{notebookMutation.data.result.message}</p> : null}
                  </div>
                  <div
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]',
                      theme === 'dark' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700',
                    )}
                  >
                    {notebookMutation.data.result.status}
                  </div>
                </div>

                {notebookMutation.data.result.warnings.length ? (
                  <div
                    className={cn(
                      'mt-4 rounded-2xl border p-4 text-sm',
                      theme === 'dark' ? 'border-orange-500/20 bg-orange-500/10 text-orange-200' : 'border-orange-200 bg-orange-50 text-orange-700',
                    )}
                  >
                    <p className="font-semibold">Runtime notes</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {notebookMutation.data.result.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {notebookMutation.data.result.stdout ? (
                  <div className={cn('mt-4 rounded-2xl p-4 font-mono text-sm text-emerald-300', theme === 'dark' ? 'bg-black' : 'bg-slate-950')}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/70">Stdout</p>
                    <pre className="whitespace-pre-wrap">{notebookMutation.data.result.stdout}</pre>
                  </div>
                ) : null}
              </Panel>

              {notebookMutation.data.result.rows.length ? (
                <div className="space-y-4">
                  <Panel className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Tabular Preview</p>
                      <h3 className="font-display text-2xl text-ink">{notebookMutation.data.result.row_count} rows returned</h3>
                    </div>
                    <div
                      className={cn(
                        'flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
                        theme === 'dark' ? 'bg-white/5 text-white/60' : 'bg-slate-100 text-slate/70',
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Preview returned rows
                    </div>
                  </Panel>
                  <DataTable columns={notebookMutation.data.result.columns} rows={notebookMutation.data.result.rows} />
                </div>
              ) : null}
            </div>
          ) : (
            <Panel className="text-center">
              <Play className={cn('mx-auto h-9 w-9', theme === 'dark' ? 'text-white/35' : 'text-slate-400')} />
              <h3 className="mt-4 font-display text-2xl text-ink">Run your first notebook cell</h3>
              <p className="mt-3 text-sm text-slate/75">
                Select an engine, load the sample cell, and run it. DuckDB executes immediately; Spark and DataFusion activate automatically once their runtimes are installed.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
