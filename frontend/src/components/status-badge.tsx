import { cn } from '../lib/utils'

export function StatusBadge({ status }: { status?: string }) {
  const tone = (status ?? '').toLowerCase()
  const className =
    tone === 'success'
      ? 'bg-emerald-100 text-emerald-700'
      : tone === 'failed'
        ? 'bg-rose-100 text-rose-700'
        : tone === 'running'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-700'

  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize', className)}>{status ?? 'Unknown'}</span>
}
