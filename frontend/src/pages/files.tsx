import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type DragEvent, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { DataTable } from '../components/data-table'
import { StatusBadge } from '../components/status-badge'
import { Button, EmptyState, PageHeader, Panel } from '../components/ui'
import { api } from '../lib/api'
import { formatBytes, formatDate, formatNumber } from '../lib/utils'
import { useTheme } from '../theme/theme-context'
import type { FileColumnProfile, FileRecommendationItem, UploadedFile } from '../types'

function signalTone(signal: string) {
  const normalized = signal.toLowerCase()
  if (normalized.includes('no missing') || normalized.includes('complete')) return 'bg-emerald-50 text-emerald-700'
  if (normalized.includes('blank') || normalized.includes('missing')) return 'bg-amber-50 text-amber-700'
  if (normalized.includes('duplicate') || normalized.includes('constant') || normalized.includes('high-cardinality') || normalized.includes('empty')) return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

function cardinalityTone(band: FileColumnProfile['cardinality_band']) {
  switch (band) {
    case 'unique':
      return 'bg-cyan-50 text-lagoon'
    case 'high':
      return 'bg-violet-50 text-violet-700'
    case 'medium':
      return 'bg-amber-50 text-amber-700'
    case 'low':
      return 'bg-slate-100 text-slate-700'
    case 'constant':
      return 'bg-rose-50 text-rose-700'
    default:
      return 'bg-slate-100 text-slate-500'
  }
}

function profileValue(profile: FileColumnProfile) {
  if (profile.profile_kind === 'numeric') {
    return `Min ${profile.min_value ?? 'N/A'} · Max ${profile.max_value ?? 'N/A'}`
  }
  if (profile.profile_kind === 'temporal') {
    return `Range ${profile.min_value ?? 'N/A'} → ${profile.max_value ?? 'N/A'}`
  }
  if (profile.profile_kind === 'boolean') {
    return `True ${profile.true_count ?? 0} · False ${profile.false_count ?? 0}`
  }
  if (profile.sample_values.length) {
    return profile.sample_values.join(' · ')
  }
  return 'No representative values'
}

function topValuesLabel(profile: FileColumnProfile) {
  if (!profile.top_values.length) return 'No repeated values detected'
  return profile.top_values.map((item) => `${item.value} (${formatNumber(item.count)})`).join(' · ')
}

function recommendationTone(confidence: FileRecommendationItem['confidence']) {
  switch (confidence) {
    case 'high':
      return 'bg-emerald-50 text-emerald-700'
    case 'medium':
      return 'bg-amber-50 text-amber-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function RecommendationSection({
  title,
  subtitle,
  items,
  emptyState,
}: {
  title: string
  subtitle: string
  items: FileRecommendationItem[]
  emptyState: string
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate/50">{title}</p>
          <p className="mt-2 text-sm text-slate/70">{subtitle}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate">
          {items.length}
        </span>
      </div>
      {items.length ? (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div key={`${title}-${item.column}`} className="rounded-2xl bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-ink">{item.column}</p>
                  <p className="mt-1 text-xs text-slate/65">{item.label}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${recommendationTone(item.confidence)}`}>
                  {item.confidence}
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-sm leading-6 text-slate/75">
                {item.reasons.map((reason) => (
                  <li key={`${item.column}-${reason}`}>- {reason}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate/65">{emptyState}</p>
      )}
    </div>
  )
}

export function FileExplorerPage() {
  const { hasAnyRole } = useAuth()
  const canEdit = hasAnyRole('admin', 'analyst')
  const { theme } = useTheme()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const appliedSearchFileIdRef = useRef<string | null>(null)

  const filesQuery = useQuery({ queryKey: ['files'], queryFn: api.listFiles })
  const previewQuery = useQuery({
    queryKey: ['files', selectedFileId, 'preview'],
    queryFn: () => api.previewFile(selectedFileId!),
    enabled: Boolean(selectedFileId),
  })

  useEffect(() => {
    const requestedFileId = searchParams.get('fileId')
    if (
      !requestedFileId ||
      appliedSearchFileIdRef.current === requestedFileId ||
      !filesQuery.data?.items?.some((file) => file.id === requestedFileId)
    ) {
      return
    }
    appliedSearchFileIdRef.current = requestedFileId
    setSelectedFileId(requestedFileId)
  }, [filesQuery.data, searchParams])

  const uploadMutation = useMutation({
    mutationFn: api.uploadFile,
    onSuccess: async (data) => {
      setUploadError(null)
      setSelectedFileId(data.file.id)
      queryClient.setQueryData<{ items: UploadedFile[] } | undefined>(['files'], (current) => {
        const existingItems = current?.items ?? []
        const withoutDuplicate = existingItems.filter((item) => item.id !== data.file.id)
        return { items: [data.file, ...withoutDuplicate] }
      })
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      await queryClient.invalidateQueries({ queryKey: ['files', data.file.id, 'preview'] })
    },
    onError: (error: Error) => setUploadError(error.message),
    onSettled: () => {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteFile,
    onSuccess: () => {
      setSelectedFileId(null)
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })

  const handleUploadFile = (file: File | null | undefined) => {
    if (!canEdit) return
    if (!file) return
    uploadMutation.mutate(file)
  }

  const handleDragState = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!canEdit) return
    if (!uploadMutation.isPending) {
      setIsDragActive(true)
    }
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!canEdit) return
    setIsDragActive(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!canEdit) return
    setIsDragActive(false)
    if (uploadMutation.isPending) return
    const file = event.dataTransfer.files?.[0]
    handleUploadFile(file)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Raw Zone"
        title="File Explorer"
        description="Land CSV, JSON, and Parquet files into the raw zone, inspect schema and sample rows, and curate what moves into Delta Lake."
        actions={
          canEdit ? (
            <label className="inline-flex cursor-pointer items-center rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate">
              Upload File
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json,.parquet"
                className="hidden"
                onChange={(event) => {
                  handleUploadFile(event.target.files?.[0])
                }}
              />
            </label>
          ) : undefined
        }
      />

      {!canEdit ? <Panel className="border-slate-200 bg-slate-50 text-sm text-slate-700">Your current role is read-only. You can inspect raw assets here, but uploads and deletes are limited to analysts and admins.</Panel> : null}

      {uploadError ? <Panel className="border-rose-200 bg-rose-50 text-sm text-rose-700">{uploadError}</Panel> : null}

      <Panel
        className={`border-2 border-dashed transition ${
          isDragActive ? 'border-lagoon bg-cyan-50/70 shadow-sm' : 'border-slate-200 bg-gradient-to-br from-slate-50 to-white'
        } ${uploadMutation.isPending ? 'opacity-80' : ''}`}
        onDragEnter={handleDragState}
        onDragOver={handleDragState}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Quick Ingest</p>
            <h2 className="mt-2 font-display text-3xl text-ink">
              {isDragActive ? 'Drop file to upload into the raw zone' : 'Drag and drop raw files here'}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate/70">
              Supports CSV, JSON, and Parquet. {canEdit ? 'You can still use the upload button, but drag-and-drop is faster for demo flows and repeated local testing.' : 'Your current role can preview files here, but cannot upload new assets.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate/60">
              <span className="rounded-full bg-white px-3 py-1 font-medium">CSV</span>
              <span className="rounded-full bg-white px-3 py-1 font-medium">JSON</span>
              <span className="rounded-full bg-white px-3 py-1 font-medium">Parquet</span>
              {canEdit ? (
                <span className="rounded-full bg-white px-3 py-1 font-medium">
                  {uploadMutation.isPending ? 'Upload in progress' : 'Single file upload'}
                </span>
              ) : null}
            </div>
          </div>
          {canEdit ? (
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <Button
                tone="ghost"
                disabled={uploadMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadMutation.isPending ? 'Uploading...' : 'Choose File'}
              </Button>
              <p className="text-xs uppercase tracking-[0.2em] text-slate/50">
                {isDragActive ? 'Release to upload' : 'Or drop a file onto this panel'}
              </p>
            </div>
          ) : null}
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl text-ink">Uploaded Assets</h2>
            <StatusBadge status={uploadMutation.isPending ? 'running' : 'ready'} />
          </div>
          <div className="space-y-3">
            {filesQuery.data?.items?.length ? (
              filesQuery.data.items.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setSelectedFileId(file.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedFileId === file.id
                      ? theme === 'dark'
                        ? 'border-[#f6f24a]/50 bg-[#f6f24a]/14 shadow-[0_0_0_1px_rgba(246,242,74,0.08)]'
                        : 'border-lagoon bg-cyan-50/80'
                      : theme === 'dark'
                        ? 'border-white/10 bg-white/[0.03] hover:border-white/20'
                        : 'border-slate-100 bg-slate-50/80 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-ink">{file.name}</p>
                      <p className={`mt-1 text-sm ${theme === 'dark' && selectedFileId === file.id ? 'text-white/78' : 'text-slate/70'}`}>
                        {file.file_type.toUpperCase()} • {formatBytes(file.size_bytes)} • {file.row_count ?? 'Unknown'} rows
                      </p>
                    </div>
                    {canEdit ? (
                      <Button
                        tone="ghost"
                        className="px-3 py-2 text-xs"
                        onClick={(event) => {
                          event.stopPropagation()
                          deleteMutation.mutate(file.id)
                        }}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                  <p className={`mt-3 text-xs uppercase tracking-[0.24em] ${theme === 'dark' && selectedFileId === file.id ? 'text-white/55' : 'text-slate/50'}`}>
                    {formatDate(file.created_at)}
                  </p>
                </button>
              ))
            ) : (
              <EmptyState title="No files uploaded yet" description="Upload sample data to start building the raw zone and testing the SQL workspace." />
            )}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <h2 className="font-display text-2xl text-ink">File Preview</h2>
            {previewQuery.isLoading && selectedFileId ? (
              <p className="mt-4 text-sm text-slate/70">Loading file preview and profile...</p>
            ) : previewQuery.error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {(previewQuery.error as Error).message}
              </div>
            ) : previewQuery.data ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 xl:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Rows</p>
                    <p className="mt-2 font-display text-2xl text-ink">{formatNumber(previewQuery.data.profile_summary.total_rows)}</p>
                    <p className="mt-1 text-xs text-slate/65">
                      {formatNumber(previewQuery.data.profile_summary.distinct_rows)} distinct rows
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Columns</p>
                    <p className="mt-2 font-display text-2xl text-ink">{formatNumber(previewQuery.data.profile_summary.total_columns)}</p>
                    <p className="mt-1 text-xs text-slate/65">
                      {formatNumber(previewQuery.data.profile_summary.completeness_ratio, 1)}% complete
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Null Cells</p>
                    <p className="mt-2 font-display text-2xl text-ink">{formatNumber(previewQuery.data.profile_summary.null_cells)}</p>
                    <p className="mt-1 text-xs text-slate/65">
                      {formatNumber(previewQuery.data.profile_summary.columns_with_nulls)} columns with missing values
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Duplicate Rows</p>
                    <p className="mt-2 font-display text-2xl text-ink">{formatNumber(previewQuery.data.profile_summary.duplicate_rows)}</p>
                    <p className="mt-1 text-xs text-slate/65">
                      {formatNumber(previewQuery.data.profile_summary.duplicate_ratio, 1)}% duplicate rate
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Storage Path</p>
                    <p className="mt-2 text-sm text-ink">{previewQuery.data.file.storage_path}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Blank Cells</p>
                    <p className="mt-2 text-sm font-semibold text-ink">{formatNumber(previewQuery.data.profile_summary.total_blank_cells)}</p>
                    <p className="mt-1 text-xs text-slate/65">
                      {formatNumber(previewQuery.data.profile_summary.columns_with_blank_values)} columns with blank strings
                    </p>
                  </div>
                  <div className="rounded-2xl bg-cyan-50 p-4 text-lagoon">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lagoon/70">Profile Status</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {previewQuery.data.profile_summary.quality_indicators.length ? (
                        previewQuery.data.profile_summary.quality_indicators.map((signal) => (
                          <span key={signal} className={`rounded-full px-3 py-1 text-xs font-semibold ${signalTone(signal)}`}>
                            {signal}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-lagoon">Ready for profiling</span>
                      )}
                    </div>
                  </div>
                </div>

                <Panel className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Profile-Driven Recommendations</p>
                      <h3 className="mt-2 font-display text-2xl text-ink">Suggested modeling and cleanup path</h3>
                    </div>
                    <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-lagoon">
                      {previewQuery.data.recommendations.join_keys.length +
                        previewQuery.data.recommendations.dimensions.length +
                        previewQuery.data.recommendations.metrics.length +
                        previewQuery.data.recommendations.time_columns.length}{' '}
                      candidates
                    </span>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <RecommendationSection
                      title="Join Keys"
                      subtitle="Fields that look stable enough to relate this file to other sources."
                      items={previewQuery.data.recommendations.join_keys}
                      emptyState="No strong relational key was inferred from the current sample."
                    />
                    <RecommendationSection
                      title="Dimensions"
                      subtitle="Good grouping columns for dashboards, filters, and semantic models."
                      items={previewQuery.data.recommendations.dimensions}
                      emptyState="No obvious low-cardinality dimensions were detected."
                    />
                    <RecommendationSection
                      title="Metrics"
                      subtitle="Numeric fields that look ready for aggregation in BI and curated tables."
                      items={previewQuery.data.recommendations.metrics}
                      emptyState="No numeric fields with analytical variation were detected."
                    />
                    <RecommendationSection
                      title="Time Columns"
                      subtitle="Date or timestamp fields that can anchor trend charts and freshness checks."
                      items={previewQuery.data.recommendations.time_columns}
                      emptyState="No date-oriented field was inferred automatically."
                    />
                  </div>
                  <div className="rounded-2xl bg-cyan-50 p-4 text-lagoon">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lagoon/70">Recommended Next Steps</p>
                    {previewQuery.data.recommendations.quality_actions.length ? (
                      <ul className="mt-3 space-y-2 text-sm leading-6">
                        {previewQuery.data.recommendations.quality_actions.map((action) => (
                          <li key={action}>- {action}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm">No urgent cleanup actions detected from the current file profile.</p>
                    )}
                  </div>
                </Panel>

                <Panel className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Column Profiling</p>
                      <h3 className="mt-2 font-display text-2xl text-ink">Data quality and cardinality overview</h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate/65">
                      {previewQuery.data.column_profiles.length} fields
                    </span>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {previewQuery.data.column_profiles.map((profile) => (
                      <div key={profile.name} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="break-words font-semibold text-ink">{profile.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate/55">{profile.type}</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate">
                            {formatNumber(profile.completeness_ratio, 1)}% complete
                          </span>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl bg-white px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/50">Nulls</p>
                            <p className="mt-2 text-sm font-semibold text-ink">{formatNumber(profile.null_count)}</p>
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/50">Unique %</p>
                            <p className="mt-2 text-sm font-semibold text-ink">{formatNumber(profile.uniqueness_ratio, 1)}%</p>
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/50">Distinct</p>
                            <p className="mt-2 text-sm font-semibold text-ink">{formatNumber(profile.distinct_count)}</p>
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/50">
                              {profile.profile_kind === 'string' ? 'Blank strings' : 'Profile kind'}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-ink">
                              {profile.profile_kind === 'string' ? formatNumber(profile.blank_count) : profile.profile_kind}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/50">Representative values</p>
                          <p className="mt-2 text-sm leading-6 text-slate/75">{profileValue(profile)}</p>
                          {profile.avg_value !== null && profile.avg_value !== undefined ? (
                            <p className="mt-2 text-xs text-slate/60">Average: {formatNumber(profile.avg_value, 2)}</p>
                          ) : null}
                          {profile.stddev_value !== null && profile.stddev_value !== undefined ? (
                            <p className="mt-1 text-xs text-slate/60">Std dev: {formatNumber(profile.stddev_value, 2)}</p>
                          ) : null}
                        </div>
                        <div className="mt-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/50">Top values</p>
                            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${cardinalityTone(profile.cardinality_band)}`}>
                              {profile.cardinality_band}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate/75">{topValuesLabel(profile)}</p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {profile.quality_indicators.map((signal) => (
                            <span key={`${profile.name}-${signal}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${signalTone(signal)}`}>
                              {signal}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
                <DataTable columns={previewQuery.data.columns} rows={previewQuery.data.rows} />
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate/70">Choose a file from the left panel to inspect its schema and preview its records.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
