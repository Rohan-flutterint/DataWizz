import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { Edge, Node } from 'reactflow'
import { PipelineBuilder } from '../components/pipeline-builder'
import { PageHeader, Panel, Select } from '../components/ui'
import { api } from '../lib/api'

function makeStarterNodes(): Node[] {
  return [
    {
      id: 'fileSource_1',
      type: 'fileSource',
      position: { x: 40, y: 120 },
      data: { label: 'Raw Sales', config: { fileId: '' }, type: 'fileSource' },
    },
    {
      id: 'sql_2',
      type: 'sql',
      position: { x: 320, y: 120 },
      data: { label: 'SQL Transform', config: { sql: 'SELECT * FROM {{input_1}}' }, type: 'sql' },
    },
    {
      id: 'writeDelta_3',
      type: 'writeDelta',
      position: { x: 620, y: 120 },
      data: { label: 'Write Delta', config: { tableName: 'sales_curated', mode: 'overwrite' }, type: 'writeDelta' },
    },
  ]
}

export function PipelineBuilderPage() {
  const queryClient = useQueryClient()
  const pipelinesQuery = useQuery({ queryKey: ['pipelines'], queryFn: api.listPipelines })
  const filesQuery = useQuery({ queryKey: ['files'], queryFn: api.listFiles })
  const tablesQuery = useQuery({ queryKey: ['tables'], queryFn: api.listTables })
  const [currentPipelineId, setCurrentPipelineId] = useState<string | null>(null)
  const [pipelineName, setPipelineName] = useState('Sales Curated Pipeline')
  const [pipelineDescription, setPipelineDescription] = useState('Read a raw sales file, transform it with SQL, and publish a curated Delta table.')
  const [pipelineSchedule, setPipelineSchedule] = useState('0 8 * * *')
  const [nodes, setNodes] = useState<Node[]>(makeStarterNodes())
  const [edges, setEdges] = useState<Edge[]>([
    { id: 'edge_1', source: 'fileSource_1', target: 'sql_2' },
    { id: 'edge_2', source: 'sql_2', target: 'writeDelta_3' },
  ])
  const [statusMessage, setStatusMessage] = useState('Start by selecting a source asset for the first node, then configure transforms from the side panel.')
  const [dagCode, setDagCode] = useState('')

  useEffect(() => {
    const current = pipelinesQuery.data?.items.find((item) => item.id === currentPipelineId)
    if (!current) {
      setPipelineName('Sales Curated Pipeline')
      setPipelineDescription('Read a raw sales file, transform it with SQL, and publish a curated Delta table.')
      setPipelineSchedule('0 8 * * *')
      setNodes(makeStarterNodes())
      setEdges([
        { id: 'edge_1', source: 'fileSource_1', target: 'sql_2' },
        { id: 'edge_2', source: 'sql_2', target: 'writeDelta_3' },
      ])
      return
    }
    setPipelineName(current.name)
    setPipelineDescription(current.description ?? '')
    setPipelineSchedule(current.schedule_cron ?? '')
    setNodes(
      current.definition_json.nodes.map((node) => ({
        ...node,
        data: {
          label: String(node.data?.label ?? node.type),
          config: (node.data?.config as Record<string, unknown>) ?? node.data ?? {},
          type: node.type,
        },
      })),
    )
    setEdges(current.definition_json.edges as Edge[])
  }, [currentPipelineId, pipelinesQuery.data])

  const saveMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string; nodes: Node[]; edges: Edge[] }) => {
      const definition = {
        nodes: payload.nodes.map((node) => ({
          id: node.id,
          type: node.type ?? 'sql',
          position: node.position,
          data: {
            label: (node.data as { label?: string }).label,
            config: (node.data as { config?: Record<string, unknown> }).config ?? {},
          },
        })),
        edges: payload.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
      }

      if (currentPipelineId) {
        return api.updatePipeline(currentPipelineId, {
          name: payload.name,
          description: payload.description,
          status: 'draft',
          schedule_cron: pipelineSchedule || null,
          definition,
        })
      }

      return api.createPipeline({
        name: payload.name,
        description: payload.description,
        status: 'draft',
        schedule_cron: pipelineSchedule || null,
        definition,
      })
    },
    onSuccess: (pipeline, variables) => {
      setCurrentPipelineId(pipeline.id)
      setPipelineName(pipeline.name)
      setStatusMessage(
        pipeline.name === variables.name
          ? `Saved pipeline ${pipeline.name}`
          : `Saved pipeline as ${pipeline.name} because ${variables.name} was already in use.`,
      )
      queryClient.invalidateQueries({ queryKey: ['pipelines'] })
    },
    onError: (error: Error) => {
      setStatusMessage(error.message)
    },
  })

  const ensureSaved = async (payload: { name: string; description: string; nodes: Node[]; edges: Edge[] }) => {
    const pipeline = await saveMutation.mutateAsync(payload)
    return pipeline.id
  }

  const selectedPipeline = useMemo(
    () => pipelinesQuery.data?.items.find((item) => item.id === currentPipelineId) ?? null,
    [currentPipelineId, pipelinesQuery.data],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Low-Code Orchestration"
        title="Pipeline Builder"
        description="Design end-to-end transformations visually with React Flow, persist pipeline graphs as JSON, validate DAG integrity, and export Airflow-style DAG code."
      />

      <Panel className="grid gap-4 lg:grid-cols-[260px_1fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Saved Pipelines</p>
          <Select className="mt-3" value={currentPipelineId ?? ''} onChange={(event) => setCurrentPipelineId(event.target.value || null)}>
            <option value="">New pipeline</option>
            {pipelinesQuery.data?.items.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate/75">
          <p className="font-semibold text-ink">Builder Guidance</p>
          <p className="mt-2 leading-6">Choose files and Delta tables from the side panel, wire the graph visually, and configure each step with forms instead of raw JSON. The starter pipeline already defines a simple source → transform → publish flow.</p>
        </div>
        <div className="rounded-2xl bg-cyan-50 p-4 text-sm text-lagoon">
          <p className="font-semibold">Current Status</p>
          <p className="mt-2 leading-6">{statusMessage}</p>
        </div>
      </Panel>

      <PipelineBuilder
        initialNodes={nodes}
        initialEdges={edges}
        name={pipelineName}
        description={pipelineDescription}
        scheduleCron={pipelineSchedule}
        setName={setPipelineName}
        setDescription={setPipelineDescription}
        setScheduleCron={setPipelineSchedule}
        availableFiles={filesQuery.data?.items ?? []}
        availableTables={tablesQuery.data?.items ?? []}
        onSave={async (payload) => {
          await saveMutation.mutateAsync(payload)
        }}
        onValidate={async (payload) => {
          const pipelineId = await ensureSaved({
            name: pipelineName,
            description: pipelineDescription,
            ...payload,
          })
          const result = await api.validatePipeline(pipelineId)
          setStatusMessage(result.valid ? `Validation passed: ${result.ordered_nodes.join(' → ')}` : result.issues.join(' | '))
        }}
        onRun={async (payload) => {
          const pipelineId = await ensureSaved({
            name: pipelineName,
            description: pipelineDescription,
            ...payload,
          })
          const result = await api.runPipeline(pipelineId)
          setStatusMessage(`Run ${result.run.status}: ${result.run.error_message ?? 'Pipeline completed successfully.'}`)
          queryClient.invalidateQueries({ queryKey: ['runs'] })
          queryClient.invalidateQueries({ queryKey: ['logs'] })
          queryClient.invalidateQueries({ queryKey: ['tables'] })
          const dag = await api.getAirflowDag(pipelineId)
          setDagCode(dag.code)
        }}
      />

      {selectedPipeline || dagCode ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Selected Pipeline</p>
            <pre className="mt-4 overflow-x-auto rounded-3xl bg-slate-950 p-5 font-mono text-xs leading-6 text-slate-100">
              {JSON.stringify(selectedPipeline?.definition_json ?? { nodes: [], edges: [] }, null, 2)}
            </pre>
          </Panel>
          <Panel>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Generated Airflow DAG</p>
            <pre className="mt-4 overflow-x-auto rounded-3xl bg-slate-950 p-5 font-mono text-xs leading-6 text-slate-100">
              {dagCode || 'Run a pipeline to generate exportable Airflow DAG code.'}
            </pre>
          </Panel>
        </div>
      ) : null}
    </div>
  )
}
