import Editor from '@monaco-editor/react'
import { useTheme } from '../theme/theme-context'

export function MonacoSqlEditor({
  value,
  onChange,
  height = 320,
  language = 'sql',
}: {
  value: string
  onChange: (value: string) => void
  height?: number
  language?: string
}) {
  const { theme } = useTheme()

  return (
    <Editor
      height={height}
      defaultLanguage={language}
      theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
      value={value}
      onChange={(next) => onChange(next ?? '')}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: 'on',
        fontFamily: 'IBM Plex Mono',
        padding: { top: 16, bottom: 16 },
        smoothScrolling: true,
        contextmenu: true,
        scrollBeyondLastLine: false,
        overviewRulerBorder: false,
      }}
    />
  )
}
