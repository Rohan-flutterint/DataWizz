import Editor from '@monaco-editor/react'

export function MonacoSqlEditor({
  value,
  onChange,
  height = 320,
}: {
  value: string
  onChange: (value: string) => void
  height?: number
}) {
  return (
    <Editor
      height={height}
      defaultLanguage="sql"
      theme="vs-light"
      value={value}
      onChange={(next) => onChange(next ?? '')}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: 'on',
        fontFamily: 'IBM Plex Mono',
        padding: { top: 16, bottom: 16 },
      }}
    />
  )
}
