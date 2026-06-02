import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '../lib/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="ui-page-header flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        <span className="ui-page-header-eyebrow inline-flex rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          {eyebrow}
        </span>
        <div className="space-y-2">
          <h1 className="ui-page-header-title font-display text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
          <p className="ui-page-header-description max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px]">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  )
}

export function Panel({
  children,
  className,
  ...props
}: PropsWithChildren<{ className?: string } & HTMLAttributes<HTMLDivElement>>) {
  return (
    <div {...props} className={cn('ui-panel rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
      {children}
    </div>
  )
}

export function Button({
  children,
  className,
  tone = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-[#ff3621] text-white hover:bg-[#e52c19]',
    secondary: 'bg-slate-900 text-white hover:bg-slate-800',
    ghost: 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
  }
  return (
    <button
      className={cn(
        'ui-button inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
        styles[tone],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'ui-input w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#ff3621] focus:ring-2 focus:ring-[#ff3621]/10',
        props.className,
      )}
    />
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'ui-select w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#ff3621] focus:ring-2 focus:ring-[#ff3621]/10',
        props.className,
      )}
    />
  )
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'ui-textarea w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-[#ff3621] focus:ring-2 focus:ring-[#ff3621]/10',
        props.className,
      )}
    />
  )
}

export function StatCard({
  label,
  value,
  accent,
  subtext,
}: {
  label: string
  value: string
  accent: string
  subtext: string
}) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
          <p className="font-display text-3xl font-semibold text-slate-950">{value}</p>
          <p className="text-sm text-slate-600">{subtext}</p>
        </div>
        <div className={cn('h-11 w-11 rounded-lg', accent)} />
      </div>
    </Panel>
  )
}

export function Label({ children }: PropsWithChildren) {
  return <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{children}</label>
}

export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <Panel className="flex min-h-48 flex-col items-center justify-center text-center">
      <h3 className="font-display text-2xl text-slate-950">{title}</h3>
      <p className="mt-3 max-w-md text-sm text-slate-600">{description}</p>
    </Panel>
  )
}
