import { Panel } from './ui'

export function DataTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  return (
    <Panel className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th key={column} className="border-b border-slate-200 px-4 py-3 font-semibold text-slate/75">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-slate-100 last:border-b-0">
                {columns.map((column) => (
                  <td key={`${index}-${column}`} className="px-4 py-3 align-top text-ink/85">
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
