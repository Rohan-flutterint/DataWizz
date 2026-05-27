import { useQuery } from '@tanstack/react-query'
import { Button, PageHeader, Panel } from '../components/ui'
import { StatusBadge } from '../components/status-badge'
import { api } from '../lib/api'

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate/50">{label}</p>
      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <code className="overflow-x-auto rounded-xl bg-slate-950 px-3 py-2 text-xs text-slate-100">{value}</code>
        <Button
          tone="ghost"
          className="shrink-0"
          onClick={() => {
            void navigator.clipboard.writeText(value)
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  )
}

export function SupersetSetupPage() {
  const integrationQuery = useQuery({
    queryKey: ['system', 'superset'],
    queryFn: api.getSupersetIntegrationStatus,
    refetchInterval: 10000,
  })

  const integration = integrationQuery.data

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Optional BI Integration"
        title="Superset Integration Setup"
        description="Position DataWizz as a serious internal analytics platform by showing that curated assets can be consumed both in-app and through an external BI layer like Apache Superset."
        actions={
          integration?.login?.ui_url ? (
            <a href={integration.login.ui_url} target="_blank" rel="noreferrer">
              <Button>Open Superset</Button>
            </a>
          ) : null
        }
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Health Status</p>
          <div className="mt-3 flex items-center gap-3">
            <StatusBadge status={integration?.status ?? 'checking'} />
            <span className="text-sm text-slate/70">{integrationQuery.isLoading ? 'Checking Superset health...' : integration?.detail}</span>
          </div>
        </Panel>
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Superset URL</p>
          <p className="mt-3 text-lg font-semibold text-ink">{integration?.login.ui_url ?? 'http://localhost:8088'}</p>
          <p className="mt-2 text-sm text-slate/70">Expected local UI endpoint for the optional Superset profile.</p>
        </Panel>
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">HTTP Check</p>
          <p className="mt-3 text-lg font-semibold text-ink">{integration?.http_status ?? 'N/A'}</p>
          <p className="mt-2 text-sm text-slate/70">Polled from the backend against the Superset health endpoint.</p>
        </Panel>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_minmax(0,0.95fr)]">
        <div className="space-y-5">
          <Panel className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Launch Path</p>
              <h2 className="mt-2 font-display text-3xl text-ink">Bring Up Superset Alongside DataWizz</h2>
              <p className="mt-3 text-sm leading-6 text-slate/75">
                Use the optional Compose profile to start Superset in the same local environment as PostgreSQL, MinIO, the backend, and the BI layer.
              </p>
            </div>
            <CopyField label="Compose Command" value={integration?.setup.compose_command ?? 'docker compose --profile superset up --build'} />
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate/50">Setup Notes</p>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate/75">
                {(integration?.setup.notes ?? []).map((note) => (
                  <div key={note} className="rounded-2xl bg-white p-4">
                    {note}
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Credentials</p>
              <h2 className="mt-2 font-display text-2xl text-ink">Default Demo Login</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <CopyField label="Username" value={integration?.login.username ?? 'admin'} />
              <CopyField label="Password" value={integration?.login.password ?? 'admin'} />
            </div>
            <CopyField label="Health Check URL" value={integration?.checked_url ?? 'http://localhost:8088/health'} />
          </Panel>

          <Panel className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Sample Connections</p>
              <h2 className="mt-2 font-display text-2xl text-ink">Connection Details For Demo Storytelling</h2>
            </div>
            <div className="space-y-4">
              {(integration?.sample_connections ?? []).map((connection) => (
                <div key={connection.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-semibold text-ink">{connection.label}</p>
                      <p className="mt-2 text-sm leading-6 text-slate/70">{connection.purpose}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <CopyField label="SQLAlchemy URI" value={connection.sqlalchemy_uri} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Demo Narrative</p>
              <h2 className="mt-2 font-display text-2xl text-ink">How To Present This In A Stakeholder Demo</h2>
            </div>
            <div className="space-y-3 text-sm leading-7 text-slate/75">
              {[
                '1. Show the curated sales dashboard inside DataWizz first.',
                '2. Open Superset and highlight that the same platform can support an external BI surface.',
                '3. Create a Superset database connection using one of the sample URIs.',
                '4. Register a dataset such as analytics.sales_curated and build a quick matching KPI or bar chart.',
                '5. Position this as proof that DataWizz can power both internal lakehouse workflows and broader analytics tooling.',
              ].map((step) => (
                <div key={step} className="rounded-2xl bg-slate-50 p-4">
                  {step}
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Sample Datasets</p>
              <h2 className="mt-2 font-display text-2xl text-ink">Suggested Tables To Showcase</h2>
            </div>
            <div className="space-y-3">
              {(integration?.sample_datasets ?? []).map((dataset) => (
                <div key={`${dataset.schema}.${dataset.name}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="font-semibold text-ink">{dataset.schema}.{dataset.name}</p>
                  <p className="mt-2 text-sm leading-6 text-slate/70">{dataset.description}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/55">Positioning</p>
              <h2 className="mt-2 font-display text-2xl text-ink">Why This Helps The DataWizz Story</h2>
            </div>
            <div className="space-y-3 text-sm leading-6 text-slate/75">
              {[
                'It shows that curated assets are not trapped inside a single UI.',
                'It demonstrates a practical upgrade path toward Trino, semantic governance, and external BI tools.',
                'It makes the platform feel closer to Databricks SQL, Snowflake, and modern enterprise analytics stacks.',
              ].map((point) => (
                <div key={point} className="rounded-2xl bg-cyan-50 p-4 text-lagoon">
                  {point}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
