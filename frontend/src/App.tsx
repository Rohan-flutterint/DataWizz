import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/app-shell'
import { BiHomePage } from './pages/bi-home'
import { CatalogPage } from './pages/catalog'
import { ChartBuilderPage } from './pages/chart-builder'
import { DashboardPage } from './pages/dashboard'
import { DashboardBuilderPage } from './pages/dashboard-builder'
import { DashboardViewerPage } from './pages/dashboard-viewer'
import { DatasetsPage } from './pages/datasets'
import { FileExplorerPage } from './pages/files'
import { JobLogsPage } from './pages/logs'
import { PipelineBuilderPage } from './pages/pipelines'
import { PipelineRunsPage } from './pages/runs'
import { ReportSchedulerPage } from './pages/report-scheduler'
import { SavedChartsPage } from './pages/saved-charts'
import { SettingsPage } from './pages/settings'
import { SqlWorkspacePage } from './pages/sql-workspace'
import { SupersetSetupPage } from './pages/superset'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/files" element={<FileExplorerPage />} />
        <Route path="/sql" element={<SqlWorkspacePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/pipelines" element={<PipelineBuilderPage />} />
        <Route path="/runs" element={<PipelineRunsPage />} />
        <Route path="/logs" element={<JobLogsPage />} />
        <Route path="/bi" element={<BiHomePage />} />
        <Route path="/bi/datasets" element={<DatasetsPage />} />
        <Route path="/bi/charts/new" element={<ChartBuilderPage />} />
        <Route path="/bi/charts" element={<SavedChartsPage />} />
        <Route path="/bi/dashboards/new" element={<DashboardBuilderPage />} />
        <Route path="/bi/dashboards" element={<DashboardViewerPage />} />
        <Route path="/bi/reports" element={<ReportSchedulerPage />} />
        <Route path="/bi/superset" element={<SupersetSetupPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default App
