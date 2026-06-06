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

export type FileProfileSummary = {
  total_rows: number
  total_columns: number
  null_cells: number
  columns_with_nulls: number
  columns_with_blank_values: number
  quality_indicators: string[]
}

export type FileColumnProfile = {
  name: string
  type: string
  profile_kind: 'numeric' | 'temporal' | 'boolean' | 'string' | 'other'
  null_count: number
  distinct_count: number
  blank_count: number
  completeness_ratio: number
  sample_values: string[]
  min_value?: string | null
  max_value?: string | null
  avg_value?: number | null
  true_count?: number | null
  false_count?: number | null
  quality_indicators: string[]
}

export type FilePreview = {
  file: UploadedFile
  columns: string[]
  rows: Record<string, unknown>[]
  profile_summary: FileProfileSummary
  column_profiles: FileColumnProfile[]
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
  owner?: string
  tags?: string[]
  freshness_status?: string
  lineage_hint?: string
  created_at: string
  updated_at: string
}

export type TableLineage = {
  table_id: string
  table_name: string
  schema_name: string
  upstream: {
    kind: string
    label: string
    pipeline_id?: string | null
    pipeline_name?: string | null
    node_id?: string | null
    schedule_cron?: string | null
    notebook_id?: string | null
    notebook_name?: string | null
    cell_id?: string | null
    cell_title?: string | null
    artifact_id?: string | null
    engine_id?: string | null
    source_query?: string | null
  }
  related_pipelines: {
    pipeline_id: string
    pipeline_name: string
    node_id?: string | null
    schedule_cron?: string | null
    updated_at: string
  }[]
  notebook_artifacts: {
    artifact_id: string
    notebook_id: string
    cell_id: string
    cell_title?: string | null
    artifact_kind: string
    display_name: string
    row_count?: number | null
    created_at: string
  }[]
  semantic_datasets: {
    dataset_id: string
    dataset_name: string
    metrics_count: number
    dimensions_count: number
    updated_at: string
  }[]
  charts: {
    chart_id: string
    chart_name: string
    chart_type: string
    dataset_id?: string | null
    updated_at: string
  }[]
  dashboards: {
    dashboard_id: string
    dashboard_name: string
    dashboard_description?: string | null
    updated_at: string
  }[]
  report_schedules: {
    schedule_id: string
    schedule_name: string
    dashboard_id?: string | null
    frequency: string
    destination: string
    updated_at: string
  }[]
  counts: {
    semantic_datasets: number
    charts: number
    dashboards: number
    report_schedules: number
    related_pipelines: number
    notebook_artifacts: number
  }
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

export type DemoUser = {
  name: string
  email: string
  role: string
}

export type AuthSession = {
  token: string
  user: DemoUser
}

export type GlobalSearchResult = {
  id: string
  kind: string
  title: string
  subtitle: string
  route: string
  updated_at: string
}

export type PipelineRunDetail = {
  run: PipelineRun
  pipeline?: Pipeline
  logs: JobLog[]
}

export type PipelineSchedulerSweep = {
  checked: number
  triggered: { pipeline_id: string; pipeline_name: string; run_id: string; status: string }[]
  invalid_schedules: { pipeline_id: string; pipeline_name: string; cron: string; reason: string }[]
  next_due: { pipeline_id: string; pipeline_name: string; cron: string; next_run_at: string }[]
}

export type PipelineSchedulerStatus = {
  enabled: boolean
  running: boolean
  timezone: string
  poll_interval_seconds: number
  last_tick_at?: string | null
  last_error?: string | null
  managed_pipeline_count: number
  last_summary: PipelineSchedulerSweep
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

export type ChartTraceability = {
  chart: Chart
  widget_count: number
  dashboard_count: number
  report_schedule_count: number
  dashboards: {
    dashboard_id: string
    dashboard_name: string
    dashboard_description?: string
    widget_id: string
    widget_title: string
    widget_type: string
    updated_at: string
  }[]
  report_schedules: {
    schedule_id: string
    schedule_name: string
    dashboard_id?: string
    dashboard_name?: string
    frequency: string
    destination: string
    updated_at: string
  }[]
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

export type DashboardExportChart = {
  source_chart_id: string
  name: string
  chart_type: string
  dataset_id?: string
  query_sql: string
  config_json: Record<string, unknown>
}

export type DashboardExportWidget = {
  widget_type: string
  title: string
  layout_json: Record<string, unknown>
  config_json: Record<string, unknown>
  chart_source_id?: string
}

export type DashboardExportConfig = {
  version: string
  exported_at: string
  dashboard: {
    name: string
    description?: string
    layout_json: Record<string, unknown>
    filters_json?: Record<string, unknown>[]
  }
  widgets: DashboardExportWidget[]
  charts: DashboardExportChart[]
}

export type DashboardImportResult = {
  dashboard: Dashboard
  widgets: DashboardWidget[]
  imported_charts: Chart[]
}

export type DashboardSnapshot = {
  message: string
  requested_format: string
  dashboard_name: string
  artifact_path: string
  artifact_file_name: string
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

export type SupersetIntegrationStatus = {
  status: string
  reachable: boolean
  checked_url: string
  http_status?: number
  detail?: string
  login: {
    ui_url: string
    username: string
    password: string
  }
  sample_connections: {
    label: string
    purpose: string
    sqlalchemy_uri: string
  }[]
  sample_datasets: {
    name: string
    schema: string
    description: string
  }[]
  setup: {
    compose_command: string
    profile: string
    notes: string[]
  }
}

export type QueryResult = {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
  execution_ms: number
}

export type ExecutionEngine = {
  id: string
  label: string
  vendor: string
  runtime_language: string
  available: boolean
  status: string
  summary: string
  description: string
  availability_reason?: string
  supports_sql: boolean
  supports_python: boolean
  supports_delta_read: boolean
  supports_delta_write: boolean
  supports_local_files: boolean
  notebook_ready: boolean
  sample_code: string
}

export type EngineCatalog = {
  default_engine: string
  items: ExecutionEngine[]
}

export type NotebookExecutionResult = {
  engine_id: string
  engine_label: string
  status: string
  language: string
  execution_ms: number
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
  stdout?: string | null
  message?: string | null
  warnings: string[]
  metadata: Record<string, unknown>
}

export type NotebookExecutionResponse = {
  engine: ExecutionEngine
  result: NotebookExecutionResult
}

export type NotebookCell = {
  id: string
  title?: string | null
  kind?: 'code' | 'markdown'
  code: string
}

export type NotebookDocument = {
  id: string
  name: string
  engine_id: string
  description?: string | null
  cells_json: NotebookCell[]
  latest_cell_results_json?: NotebookCellRunResult[]
  last_run_at?: string | null
  created_at: string
  updated_at: string
}

export type NotebookRun = {
  id: string
  notebook_id: string
  engine_id: string
  status: string
  started_at?: string | null
  finished_at?: string | null
  duration_ms?: number | null
  error_message?: string | null
  run_summary?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type NotebookArtifact = {
  id: string
  notebook_id: string
  notebook_run_id?: string | null
  delta_table_id?: string | null
  cell_id: string
  cell_title?: string | null
  artifact_kind: string
  display_name: string
  storage_path: string
  download_name?: string | null
  row_count?: number | null
  metadata_json?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type NotebookCellRunResult = {
  cell_id: string
  title?: string | null
  status: string
  execution_ms: number
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
  stdout?: string | null
  message?: string | null
  warnings: string[]
}

export type NotebookDetail = {
  notebook: NotebookDocument
  recent_runs: NotebookRun[]
  recent_artifacts: NotebookArtifact[]
}

export type NotebookRunExecution = {
  notebook: NotebookDocument
  run: NotebookRun
  cell_results: NotebookCellRunResult[]
}

export type NotebookCellActionExecution = {
  notebook: NotebookDocument
  run: NotebookRun
  cell_results: NotebookCellRunResult[]
  mode: string
  start_cell_id: string
}

export type NotebookSnippet = {
  id: string
  name: string
  description?: string
  category: string
  engine_scope: string
  cell_kind: 'code' | 'markdown'
  code: string
  is_template: boolean
  created_at: string
  updated_at: string
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

export type ReportSnapshot = {
  id: string
  schedule_id?: string
  dashboard_id?: string
  schedule_name: string
  dashboard_name?: string
  requested_format: string
  destination: string
  status: string
  artifact_path?: string
  artifact_file_name?: string
  artifact_kind?: string
  error_message?: string
  summary_json?: Record<string, unknown>
  started_at?: string
  finished_at?: string
  created_at: string
  updated_at: string
}

export type ReportScheduleExecution = {
  schedule: ReportSchedule
  snapshot: ReportSnapshot
}
