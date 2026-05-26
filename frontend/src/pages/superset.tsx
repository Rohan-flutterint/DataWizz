import { PageHeader, Panel } from '../components/ui'

export function SupersetSetupPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Optional BI Integration"
        title="Superset Integration Setup"
        description="This project includes a documented path for running Apache Superset alongside the internal platform to demonstrate how curated data could also be consumed externally."
      />

      <Panel className="space-y-4">
        <h2 className="font-display text-2xl text-ink">Recommended Demo Path</h2>
        <ol className="space-y-3 text-sm leading-7 text-slate/75">
          <li>1. Start the lakehouse stack with Docker Compose.</li>
          <li>2. Bring up Superset as an optional service from the same compose file.</li>
          <li>3. Point Superset at PostgreSQL metadata and curated storage-backed query paths.</li>
          <li>4. Build a matching “Sales Analytics Dashboard” using the curated `sales_curated` table.</li>
        </ol>
        <pre className="rounded-3xl bg-slate-950 p-5 font-mono text-xs leading-6 text-slate-100">{`docker compose --profile superset up --build`}</pre>
      </Panel>
    </div>
  )
}
