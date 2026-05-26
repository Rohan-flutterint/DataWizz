# Internal Lakehouse Platform

A demo-ready internal data warehouse / lakehouse platform inspired by Databricks, Snowflake, ClickHouse Cloud, Airflow, Superset, and Metabase.

This first version is built as a production-style MVP with:

- React + TypeScript frontend
- Tailwind-based enterprise UI
- FastAPI backend
- DuckDB query execution
- Delta Lake writes via `delta-rs`
- PostgreSQL metadata store
- MinIO-ready object storage configuration
- Visual pipeline builder with React Flow
- In-app BI layer for charts and dashboards

## Monorepo Structure

```text
frontend/         React app with dashboard, SQL workspace, catalog, pipelines, and BI pages
backend/          FastAPI app, services, metadata models, and Alembic migration
docs/             Architecture, API docs, and demo workflow
sample_data/      CSV sample files and example pipeline JSON
storage/          Raw, curated, and temp storage zones
docker-compose.yml
```

## What the MVP Includes

- File upload, list, preview, schema inference, and delete
- SQL querying over raw files with DuckDB
- Writing query results to Delta Lake format
- Catalog page for Delta table discovery and preview
- Visual pipeline builder with manual save, validate, run, and Airflow DAG export
- Pipeline runs and log pages
- BI dataset explorer, chart builder, dashboard builder, dashboard viewer, and report scheduler
- Docker Compose setup for frontend, backend, PostgreSQL, MinIO, and optional Superset

## Architecture

See [docs/architecture.md](/Users/dubeyroh/Library/CloudStorage/OneDrive-TheStarsGroup/Desktop/DataWizz/docs/architecture.md).

## Local Development

### One Command Startup

From `/Users/dubeyroh/Library/CloudStorage/OneDrive-TheStarsGroup/Desktop/DataWizz`:

```bash
./run.sh
```

Behavior:

- Uses Docker Compose if `docker` is installed
- Falls back to local demo mode if Docker is not installed
- Local demo mode starts:
  - backend on `http://localhost:8000`
  - frontend on `http://localhost:5173`
  - backend storage/metadata with SQLite for convenience
- If ports `8000` or `5173` are already occupied, the script automatically stops the stale listener processes before starting

Other options:

```bash
./run.sh docker
./run.sh docker superset
./run.sh local
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Note:

- The backend expects PostgreSQL by default.
- For local smoke testing without PostgreSQL, you can override `DATABASE_URL=sqlite:///./local.db`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend dev server default: `http://localhost:5173`

## Docker Demo Setup

The current environment where this project was generated does not have Docker installed, so the compose stack could not be executed here. The configuration is included for local use.

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- FastAPI docs: `http://localhost:8000/docs`
- PostgreSQL: `localhost:5432`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

Optional Superset:

```bash
docker compose --profile superset up --build
```

Superset: `http://localhost:8088`

## Demo Walkthrough

See [docs/demo-workflow.md](/Users/dubeyroh/Library/CloudStorage/OneDrive-TheStarsGroup/Desktop/DataWizz/docs/demo-workflow.md).

Recommended first demo:

1. Upload `sample_data/sales.csv` and `sample_data/customers.csv`.
2. Run SQL against `raw_sales`.
3. Write `sales_curated` as a Delta table.
4. Validate and run a visual pipeline.
5. Create charts and assemble a `Sales Analytics Dashboard`.

## API Documentation

See [docs/api.md](/Users/dubeyroh/Library/CloudStorage/OneDrive-TheStarsGroup/Desktop/DataWizz/docs/api.md).

## Sample Queries

Regional revenue:

```sql
SELECT
  region,
  SUM(revenue) AS total_revenue
FROM raw_sales
GROUP BY region
ORDER BY total_revenue DESC;
```

Monthly revenue:

```sql
SELECT
  strftime(order_date, '%Y-%m') AS month,
  SUM(revenue) AS total_revenue
FROM raw_sales
GROUP BY 1
ORDER BY 1;
```

Top customers:

```sql
SELECT
  customer_id,
  SUM(revenue) AS total_revenue
FROM raw_sales
GROUP BY customer_id
ORDER BY total_revenue DESC
LIMIT 10;
```

## Verification Performed

- `python3 -m compileall backend/app backend/alembic`
- Frontend production build with `npm run build`
- Backend dependency installation with `pip install -e '.[dev]'`
- Backend runtime smoke test with SQLite against:
  - `GET /health`
  - `GET /api/system/settings`

## Known MVP Notes

- The SQL workspace expects generated view names such as `raw_sales` based on uploaded filenames.
- Pipeline node configuration is currently edited as JSON in the side panel for speed and flexibility.
- The in-app BI layer is intentionally lightweight and SQL-driven; Superset is the richer optional external BI path.
- Docker configuration is provided, but not executed in this environment because Docker is unavailable here.

## Future Enhancements

### Core Platform TODOs

- Authentication and RBAC
- Apache Spark execution engine
- Apache Flink streaming pipelines
- Data quality checks using Great Expectations
- Lineage using OpenLineage
- Data catalog using Hive Metastore or Nessie
- Query optimization layer
- Multi-user workspace
- Git-based pipeline versioning
- CI/CD deployment
- Kubernetes deployment
- Real Airflow integration
- Monitoring with Prometheus and Grafana

### BI and Reporting TODOs

- Natural language to chart generation
- Dashboard sharing
- Public/private dashboards
- Row-level security
- Column-level masking
- Embedded analytics
- Semantic layer similar to Cube.dev
- Metrics layer similar to dbt Semantic Layer
- Alerts on KPI thresholds
- Dashboard versioning
- Git-backed dashboard definitions
- PDF email subscriptions
