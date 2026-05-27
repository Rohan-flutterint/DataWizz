import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type DragEvent, useRef, useState } from 'react'
import { DataTable } from '../components/data-table'
import { StatusBadge } from '../components/status-badge'
import { Button, EmptyState, PageHeader, Panel } from '../components/ui'
import { api } from '../lib/api'
import { formatBytes, formatDate } from '../lib/utils'
import type { UploadedFile } from '../types'

export function FileExplorerPage() {
  const queryClient = useQueryClient()
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const filesQuery = useQuery({ queryKey: ['files'], queryFn: api.listFiles })
  const previewQuery = useQuery({
    queryKey: ['files', selectedFileId, 'preview'],
    queryFn: () => api.previewFile(selectedFileId!),
    enabled: Boolean(selectedFileId),
  })

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
    if (!file) return
    uploadMutation.mutate(file)
  }

  const handleDragState = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!uploadMutation.isPending) {
      setIsDragActive(true)
    }
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragActive(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
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
        }
      />

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
              Supports CSV, JSON, and Parquet. You can still use the upload button, but drag-and-drop is faster for demo flows and repeated local testing.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate/60">
              <span className="rounded-full bg-white px-3 py-1 font-medium">CSV</span>
              <span className="rounded-full bg-white px-3 py-1 font-medium">JSON</span>
              <span className="rounded-full bg-white px-3 py-1 font-medium">Parquet</span>
              <span className="rounded-full bg-white px-3 py-1 font-medium">
                {uploadMutation.isPending ? 'Upload in progress' : 'Single file upload'}
              </span>
            </div>
          </div>
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
                    selectedFileId === file.id ? 'border-lagoon bg-cyan-50/80' : 'border-slate-100 bg-slate-50/80 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-ink">{file.name}</p>
                      <p className="mt-1 text-sm text-slate/70">
                        {file.file_type.toUpperCase()} • {formatBytes(file.size_bytes)} • {file.row_count ?? 'Unknown'} rows
                      </p>
                    </div>
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
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate/50">{formatDate(file.created_at)}</p>
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
            {previewQuery.data ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Storage Path</p>
                    <p className="mt-2 text-sm text-ink">{previewQuery.data.file.storage_path}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/50">Schema</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {previewQuery.data.file.schema_json?.map((field) => (
                        <span key={field.name} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate">
                          {field.name}: {field.type}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
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
