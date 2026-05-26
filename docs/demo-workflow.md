# Demo Workflow

## MVP Demo Flow

1. Start the platform locally with Docker Compose or run backend/frontend separately.
2. Open the web app at `http://localhost:3000` if using Docker.
3. Upload:
   - `sample_data/sales.csv`
   - `sample_data/customers.csv`
   - optionally `sample_data/orders.csv`
4. Open the SQL Workspace and run:

```sql
SELECT
  region,
  SUM(revenue) AS total_revenue,
  COUNT(DISTINCT customer_id) AS total_customers,
  COUNT(*) AS total_orders
FROM raw_sales
GROUP BY region
ORDER BY total_revenue DESC;
```

5. Write a curated Delta table named `sales_curated`.
6. Open the Catalog page and preview the new Delta table.
7. Open the Pipeline Builder, paste the sample JSON definition logic from `sample_data/pipeline_sales_curated.json`, replace file IDs, save, validate, and run.
8. Open Pipeline Runs and Job Logs to show orchestration observability.
9. Register `sales_curated` in Dataset Explorer.
10. Create charts in Chart Builder:
    - KPI or number card for total revenue
    - monthly revenue line chart
    - top customers bar chart
    - region-wise revenue pie chart
11. Assemble them into a dashboard named `Sales Analytics Dashboard`.
12. Optionally launch Superset with the `superset` compose profile and demonstrate the same curated data from an external BI layer.
