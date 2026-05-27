export type UploadedFile = {
  id: string
  name: string
  storage_path: string
  file_type: string
  size_bytes: number
  schema_json?: { name: string; type: string }[]
  row_count?: number
  source: string
  created_at: string
  updated_at: string
}

export type DeltaTable = {
  id: string
  name: string
  schema_name: string
  storage_path: string
  description?: string
  schema_json?: { name: string; type: string }[]
  mode: string
  source_query?: string
  row_count?: number
  last_refreshed_at?: string
  created_at: string
  updated_at: string
}

export type QueryHistory = {
  id: string
  name?: string
  sql_text: string
  status: string
  execution_ms?: number
  row_count?: number
  result_preview?: Record<string, unknown>[]
  error_message?: string
  created_at: string
  updated_at: string
}

export type PipelineNode = {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export type PipelineEdge = {
  id: string
  source: string
  target: string
}

export type Pipeline = {
  id: string
  name: string
  description?: string
  status: string
  schedule_cron?: string
  definition_json: { nodes: PipelineNode[]; edges: PipelineEdge[] }
  created_at: string
  updated_at: string
}

export type PipelineRun = {
  id: string
  pipeline_id: string
  pipeline_name?: string
  status: string
  started_at?: string
  finished_at?: string
  duration_ms?: number
  trigger_type: string
  error_message?: string
  run_summary?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type JobLog = {
  id: string
  pipeline_run_id?: string
  query_id?: string
  level: string
  source: string
  message: string
  status?: string
  context_json?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type PipelineRunDetail = {
  run: PipelineRun
  pipeline?: Pipeline
  logs: JobLog[]
}

export type SemanticDataset = {
  id: string
  name: string
  source_type: string
  source_ref: string
  description?: string
  schema_json?: { name: string; type: string }[]
  metrics_json?: Record<string, unknown>[]
  dimensions_json?: Record<string, unknown>[]
  created_at: string
  updated_at: string
}

export type CandidateDataset = {
  id: string
  name: string
  schema_name?: string
  source_type: string
  source_ref: string
  description?: string
  schema_json?: { name: string; type: string }[]
  row_count?: number
  updated_at?: string
}

export type DatasetPreview = {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
  schema_json?: { name: string; type: string }[]
}

export type Chart = {
  id: string
  name: string
  chart_type: string
  dataset_id?: string
  query_sql: string
  config_json: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type Dashboard = {
  id: string
  name: string
  description?: string
  layout_json: Record<string, unknown>
  filters_json?: Record<string, unknown>[]
  created_at: string
  updated_at: string
}

export type DashboardWidget = {
  id: string
  dashboard_id: string
  chart_id?: string
  widget_type: string
  title: string
  layout_json: { i?: string; x: number; y: number; w: number; h: number }
  config_json: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type DashboardMetrics = {
  total_files: number
  total_delta_tables: number
  total_pipeline_runs: number
  failed_jobs: number
  storage_usage_bytes: number
  recent_activity: {
    id: string
    kind: string
    title: string
    status: string
    created_at: string
  }[]
}

export type QueryResult = {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
  execution_ms: number
}

export type ReportSchedule = {
  id: string
  name: string
  dashboard_id?: string
  frequency: string
  destination: string
  config_json: Record<string, unknown>
  created_at: string
  updated_at: string
}
