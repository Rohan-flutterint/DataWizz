import { Panel } from './ui'
import { useTheme } from '../theme/theme-context'

export function DataTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  const { theme } = useTheme()

  return (
    <Panel className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className={theme === 'dark' ? 'bg-white/[0.04]' : 'bg-slate-50'}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className={`px-4 py-3 font-semibold ${
                    theme === 'dark' ? 'border-b border-white/10 text-white/72' : 'border-b border-slate-200 text-slate/75'
                  }`}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className={theme === 'dark' ? 'border-b border-white/10 last:border-b-0' : 'border-b border-slate-100 last:border-b-0'}>
                {columns.map((column) => (
                  <td
                    key={`${index}-${column}`}
                    className={`px-4 py-3 align-top ${
                      theme === 'dark' ? 'text-white/90' : 'text-ink/85'
                    }`}
                  >
                    {String(row[column] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
