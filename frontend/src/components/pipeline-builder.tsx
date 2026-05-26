import { useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { DeltaTable, UploadedFile } from '../types'
import { Button, Input, Label, Panel, Select, Textarea } from './ui'

const pipelineTypes = [
  'fileSource',
  'deltaSource',
  'filter',
  'select',
  'join',
  'aggregate',
  'sql',
  'validate',
  'writeDelta',
  'schedule',
] as const

type PipelineNodeType = (typeof pipelineTypes)[number]

type BuilderNodeData = {
  label: string
  config: Record<string, unknown>
  type: string
}

type BuilderProps = {
  initialNodes: Node[]
  initialEdges: Edge[]
  onSave: (payload: { name: string; description: string; nodes: Node[]; edges: Edge[] }) => Promise<void>
  onValidate?: (payload: { nodes: Node[]; edges: Edge[] }) => Promise<void>
  onRun?: (payload: { nodes: Node[]; edges: Edge[] }) => Promise<void>
  name: string
  description: string
  scheduleCron: string
  setName: (value: string) => void
  setDescription: (value: string) => void
  setScheduleCron: (value: string) => void
  availableFiles: UploadedFile[]
  availableTables: DeltaTable[]
}

const nodeDefaults: Record<PipelineNodeType, { label: string; config: Record<string, unknown> }> = {
  fileSource: { label: 'File Source', config: { fileId: '' } },
  deltaSource: { label: 'Delta Source', config: { tableId: '' } },
  filter: { label: 'Filter Rows', config: { condition: '1 = 1' } },
  select: { label: 'Select Columns', config: { columns: ['*'] } },
  join: { label: 'Join Datasets', config: { joinType: 'inner', leftKey: '', rightKey: '' } },
  aggregate: { label: 'Aggregate', config: { groupBy: [], metrics: [{ agg: 'sum', column: 'amount', alias: 'total_amount' }] } },
  sql: { label: 'SQL Transform', config: { sql: 'SELECT * FROM {{input_1}}' } },
  validate: { label: 'Validate Data', config: { minRows: 1 } },
  writeDelta: { label: 'Write Delta', config: { tableName: 'sales_curated', schemaName: 'analytics', mode: 'overwrite', description: '' } },
  schedule: { label: 'Schedule', config: { cron: '0 8 * * *', note: 'Daily 8 AM refresh' } },
}

function titleizeType(type: string) {
  return type
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase())
}

function normalizeNodeData(node: Node): BuilderNodeData {
  const base = nodeDefaults[(node.type ?? 'sql') as PipelineNodeType] ?? nodeDefaults.sql
  const data = (node.data as Record<string, unknown> | undefined) ?? {}
  const configFromNode = (data.config as Record<string, unknown> | undefined) ?? data

  return {
    label: String(data.label ?? base.label),
    config: { ...base.config, ...(configFromNode ?? {}) },
    type: String(node.type ?? data.type ?? 'sql'),
  }
}

function normalizeNodes(nodes: Node[]): Node<BuilderNodeData>[] {
  return nodes.map((node) => ({
    ...node,
    type: node.type ?? 'sql',
    data: normalizeNodeData(node),
  }))
}

function formatList(value: unknown) {
  if (!Array.isArray(value)) return ''
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .join(', ')
}

function parseList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatMetrics(value: unknown) {
  if (!Array.isArray(value)) return ''
  return value
    .map((metric) => {
      if (!metric || typeof metric !== 'object') return ''
      const entry = metric as Record<string, unknown>
      return [entry.agg, entry.column, entry.alias].map((item) => String(item ?? '').trim()).join(':')
    })
    .filter(Boolean)
    .join('\n')
}

function parseMetrics(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [agg = 'count', column = '*', alias = 'metric'] = line.split(':').map((part) => part.trim())
      return { agg, column, alias }
    })
}

function describeNode(data: BuilderNodeData) {
  const config = data.config
  switch (data.type) {
    case 'fileSource':
      return String(config.fileId || 'Pick a file')
    case 'deltaSource':
      return String(config.tableId || 'Pick a Delta table')
    case 'filter':
      return String(config.condition || 'No filter set')
    case 'select':
      return formatList(config.columns) || 'Select all columns'
    case 'join':
      return `${String(config.joinType || 'inner')} join`
    case 'aggregate':
      return formatList(config.groupBy) || 'Aggregate all rows'
    case 'sql':
      return 'Custom SQL step'
    case 'validate':
      return `Minimum rows: ${String(config.minRows || 1)}`
    case 'writeDelta':
      return String(config.tableName || 'Target table')
    case 'schedule':
      return String(config.cron || 'No schedule')
    default:
      return titleizeType(data.type)
  }
}

function BuilderNode({ data }: { data: BuilderNodeData }) {
  return (
    <div className="min-w-52 rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate/55">{titleizeType(data.type)}</p>
      <p className="mt-2 font-display text-lg text-ink">{data.label}</p>
      <p className="mt-2 max-w-48 truncate text-xs text-slate/65">{describeNode(data)}</p>
    </div>
  )
}

const nodeTypes = Object.fromEntries(pipelineTypes.map((type) => [type, BuilderNode]))

type NodeFieldsProps = {
  node: Node<BuilderNodeData>
  availableFiles: UploadedFile[]
  availableTables: DeltaTable[]
  updateConfig: (patch: Record<string, unknown>) => void
}

function NodeFields({ node, availableFiles, availableTables, updateConfig }: NodeFieldsProps) {
  const config = node.data.config

  switch (node.type) {
    case 'fileSource':
      return (
        <div className="space-y-4">
          <div>
            <Label>Uploaded File</Label>
            <Select value={String(config.fileId ?? '')} onChange={(event) => updateConfig({ fileId: event.target.value })}>
              <option value="">Select a file</option>
              {availableFiles.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.name}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs leading-5 text-slate/65">This node exposes the selected file as an input dataset for downstream transforms.</p>
        </div>
      )
    case 'deltaSource':
      return (
        <div className="space-y-4">
          <div>
            <Label>Delta Table</Label>
            <Select value={String(config.tableId ?? '')} onChange={(event) => updateConfig({ tableId: event.target.value })}>
              <option value="">Select a Delta table</option>
              {availableTables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs leading-5 text-slate/65">Use a curated table as the upstream source for another pipeline.</p>
        </div>
      )
    case 'filter':
      return (
        <div className="space-y-4">
          <div>
            <Label>Filter Condition</Label>
            <Textarea
              rows={4}
              value={String(config.condition ?? '')}
              onChange={(event) => updateConfig({ condition: event.target.value })}
              placeholder="order_total > 100 AND region = 'West'"
            />
          </div>
        </div>
      )
    case 'select':
      return (
        <div className="space-y-4">
          <div>
            <Label>Columns</Label>
            <Input
              value={formatList(config.columns)}
              onChange={(event) => updateConfig({ columns: parseList(event.target.value) || ['*'] })}
              placeholder="order_id, customer_id, amount"
            />
          </div>
          <p className="text-xs leading-5 text-slate/65">Separate columns with commas. Leave as `*` to keep everything.</p>
        </div>
      )
    case 'join':
      return (
        <div className="grid gap-4">
          <div>
            <Label>Join Type</Label>
            <Select value={String(config.joinType ?? 'inner')} onChange={(event) => updateConfig({ joinType: event.target.value })}>
              <option value="inner">inner</option>
              <option value="left">left</option>
              <option value="right">right</option>
              <option value="full">full</option>
            </Select>
          </div>
          <div>
            <Label>Left Key</Label>
            <Input value={String(config.leftKey ?? '')} onChange={(event) => updateConfig({ leftKey: event.target.value })} placeholder="customer_id" />
          </div>
          <div>
            <Label>Right Key</Label>
            <Input value={String(config.rightKey ?? '')} onChange={(event) => updateConfig({ rightKey: event.target.value })} placeholder="customer_id" />
          </div>
        </div>
      )
    case 'aggregate':
      return (
        <div className="space-y-4">
          <div>
            <Label>Group By Columns</Label>
            <Input
              value={formatList(config.groupBy)}
              onChange={(event) => updateConfig({ groupBy: parseList(event.target.value) })}
              placeholder="region, order_month"
            />
          </div>
          <div>
            <Label>Metrics</Label>
            <Textarea
              rows={6}
              value={formatMetrics(config.metrics)}
              onChange={(event) => updateConfig({ metrics: parseMetrics(event.target.value) })}
              placeholder={'sum:amount:total_amount\ncount:*:order_count'}
            />
          </div>
          <p className="text-xs leading-5 text-slate/65">Use one metric per line in `agg:column:alias` format.</p>
        </div>
      )
    case 'sql':
      return (
        <div className="space-y-4">
          <div>
            <Label>SQL Transform</Label>
            <Textarea
              rows={10}
              value={String(config.sql ?? '')}
              onChange={(event) => updateConfig({ sql: event.target.value })}
              placeholder={'SELECT *\nFROM {{input_1}}'}
            />
          </div>
          <p className="text-xs leading-5 text-slate/65">
            Reference upstream nodes with placeholders like <code>{'{{input_1}}'}</code> and <code>{'{{input_2}}'}</code>.
          </p>
        </div>
      )
    case 'validate':
      return (
        <div className="space-y-4">
          <div>
            <Label>Minimum Rows</Label>
            <Input
              type="number"
              min={1}
              value={String(config.minRows ?? 1)}
              onChange={(event) => updateConfig({ minRows: Number(event.target.value || 1) })}
            />
          </div>
          <p className="text-xs leading-5 text-slate/65">The run fails if the upstream dataset has fewer rows than this threshold.</p>
        </div>
      )
    case 'writeDelta':
      return (
        <div className="space-y-4">
          <div>
            <Label>Table Name</Label>
            <Input value={String(config.tableName ?? '')} onChange={(event) => updateConfig({ tableName: event.target.value })} placeholder="sales_curated" />
          </div>
          <div>
            <Label>Schema Name</Label>
            <Input value={String(config.schemaName ?? 'analytics')} onChange={(event) => updateConfig({ schemaName: event.target.value })} placeholder="analytics" />
          </div>
          <div>
            <Label>Write Mode</Label>
            <Select value={String(config.mode ?? 'overwrite')} onChange={(event) => updateConfig({ mode: event.target.value })}>
              <option value="overwrite">overwrite</option>
              <option value="append">append</option>
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={4}
              value={String(config.description ?? '')}
              onChange={(event) => updateConfig({ description: event.target.value })}
              placeholder="Curated sales output for BI dashboards"
            />
          </div>
        </div>
      )
    case 'schedule':
      return (
        <div className="space-y-4">
          <div>
            <Label>Cron Expression</Label>
            <Input value={String(config.cron ?? '')} onChange={(event) => updateConfig({ cron: event.target.value })} placeholder="0 8 * * *" />
          </div>
          <div>
            <Label>Schedule Note</Label>
            <Textarea rows={4} value={String(config.note ?? '')} onChange={(event) => updateConfig({ note: event.target.value })} placeholder="Runs every weekday before business reporting." />
          </div>
          <p className="text-xs leading-5 text-slate/65">This is pipeline schedule metadata that can be reused for future orchestration integrations.</p>
        </div>
      )
    default:
      return <p className="text-sm text-slate/70">Select any node on the canvas to edit its configuration.</p>
  }
}

export function PipelineBuilder({
  initialNodes,
  initialEdges,
  onSave,
  onValidate,
  onRun,
  name,
  description,
  scheduleCron,
  setName,
  setDescription,
  setScheduleCron,
  availableFiles,
  availableTables,
}: BuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNodeData>(normalizeNodes(initialNodes))
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialNodes[0]?.id ?? null)

  useEffect(() => {
    setNodes(normalizeNodes(initialNodes))
    setSelectedNodeId(initialNodes[0]?.id ?? null)
  }, [initialNodes, setNodes])

  useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

  useEffect(() => {
    if (!nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(nodes[0]?.id ?? null)
    }
  }, [nodes, selectedNodeId])

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId])

  const addNode = (type: PipelineNodeType) => {
    const nextId = `${type}_${nodes.length + 1}`
    const base = nodeDefaults[type]
    setNodes((current) => [
      ...current,
      {
        id: nextId,
        type,
        position: { x: 60 + current.length * 28, y: 60 + current.length * 18 },
        data: { label: base.label, config: { ...base.config }, type },
      },
    ])
    setSelectedNodeId(nextId)
  }

  const onConnect = (connection: Edge | Connection) => setEdges((current) => addEdge({ ...connection, id: `edge_${current.length + 1}` }, current))

  const updateSelectedLabel = (label: string) => {
    if (!selectedNode) return
    setNodes((current) =>
      current.map((node) => (node.id === selectedNode.id ? { ...node, data: { ...node.data, label } } : node)),
    )
  }

  const updateSelectedConfig = (patch: Record<string, unknown>) => {
    if (!selectedNode) return
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                config: { ...node.data.config, ...patch },
              },
            }
          : node,
      ),
    )
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
      <Panel className="space-y-5">
        <div>
          <Label>Pipeline Name</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Sales Curated Pipeline" />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="Join raw sales and customers, then publish a curated Delta table." />
        </div>
        <div>
          <Label>Schedule (Cron)</Label>
          <Input value={scheduleCron} onChange={(event) => setScheduleCron(event.target.value)} placeholder="0 8 * * *" />
          <p className="mt-2 text-xs leading-5 text-slate/65">Stored with the pipeline now so later scheduling and Airflow integration can reuse it.</p>
        </div>
        <div>
          <Label>Node Palette</Label>
          <div className="mt-3 flex flex-wrap gap-2">
            {pipelineTypes.map((type) => (
              <Button key={type} tone="ghost" className="text-xs" onClick={() => addNode(type)}>
                {titleizeType(type)}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <Button onClick={() => onSave({ name, description, nodes, edges })}>Save Pipeline</Button>
          {onValidate ? (
            <Button tone="secondary" onClick={() => onValidate({ nodes, edges })}>
              Validate
            </Button>
          ) : null}
          {onRun ? (
            <Button tone="ghost" onClick={() => onRun({ nodes, edges })}>
              Run Now
            </Button>
          ) : null}
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Available Files</p>
            <div className="mt-3 space-y-2">
              {availableFiles.length ? (
                availableFiles.map((file) => (
                  <div key={file.id} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm">
                    <p className="font-medium text-ink">{file.name}</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate/60">{file.id}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate/70">Upload files first to use them as pipeline sources.</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Curated Tables</p>
            <div className="mt-3 space-y-2">
              {availableTables.length ? (
                availableTables.map((table) => (
                  <div key={table.id} className="rounded-2xl bg-cyan-50 px-3 py-2 text-sm text-lagoon">
                    <p className="font-medium">{table.name}</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-lagoon/70">{table.id}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate/70">Delta outputs appear here once you publish a curated table.</p>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="h-[720px] overflow-hidden p-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background color="#d7dde5" gap={24} />
        </ReactFlow>
      </Panel>

      <Panel className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Node Config</p>
            <h3 className="font-display text-2xl text-ink">{selectedNode?.data.label ?? 'Select a node'}</h3>
            <p className="mt-1 text-sm text-slate/65">{selectedNode ? titleizeType(String(selectedNode.type)) : 'No node selected'}</p>
          </div>
          {selectedNode ? (
            <Button
              tone="danger"
              onClick={() => {
                setNodes((current) => current.filter((node) => node.id !== selectedNode.id))
                setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id))
                setSelectedNodeId(null)
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>

        {selectedNode ? (
          <>
            <div>
              <Label>Node Label</Label>
              <Input value={selectedNode.data.label} onChange={(event) => updateSelectedLabel(event.target.value)} />
            </div>
            <NodeFields node={selectedNode} availableFiles={availableFiles} availableTables={availableTables} updateConfig={updateSelectedConfig} />
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Config Preview</p>
              <pre className="mt-3 overflow-x-auto rounded-3xl bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
                {JSON.stringify(selectedNode.data.config, null, 2)}
              </pre>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate/70">Select any node on the canvas to configure its inputs, transforms, or write behavior.</p>
        )}
      </Panel>
    </div>
  )
}
