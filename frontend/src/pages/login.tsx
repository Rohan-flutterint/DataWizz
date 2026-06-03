import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { BrandLogo } from '../components/brand-logo'
import { Input, Panel } from '../components/ui'

export function LoginPage() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('admin@datawizz.local')
  const [password, setPassword] = useState('datawizz123')

  const from = (location.state as { from?: string } | undefined)?.from || '/'

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: () => {
      navigate(from, { replace: true })
    },
  })

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#0b0b0b] text-white">
      <div className="h-12 w-full border-b border-black/30 bg-[#f6f24a]" />
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(246,242,74,0.18),transparent_28%),radial-gradient(circle_at_84%_24%,rgba(255,255,255,0.08),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_42%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px)', backgroundSize: '72px 72px' }} />

        <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl items-center px-4 py-10 sm:px-6 lg:px-10">
          <div className="grid w-full gap-8 xl:grid-cols-[1.15fr_0.85fr] xl:gap-12">
            <section className="flex flex-col justify-between rounded-[36px] border border-white/10 bg-white/[0.03] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur md:p-10">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
                    Lakehouse
                  </span>
                  <span className="rounded-full bg-[#f6f24a] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-black">
                    Warehouse
                  </span>
                </div>

                <div className="mt-8 max-w-3xl">
                  <p className="text-sm font-medium uppercase tracking-[0.32em] text-white/45">DataWizz Workspace</p>
                  <h1 className="mt-5 font-display text-5xl leading-[0.95] text-white sm:text-6xl xl:text-7xl">
                    The
                    <br />
                    data operating
                    <br />
                    surface.
                  </h1>
                  <p className="mt-6 max-w-2xl text-lg leading-8 text-white/68 sm:text-xl">
                    Upload raw files, model them with SQL, publish Delta tables, orchestrate jobs, and ship dashboards from one modern in-house platform.
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap gap-4">
                  <div className="rounded-2xl border border-[#f6f24a]/25 bg-[#f6f24a]/10 px-5 py-4 text-sm text-[#fbf8a1] shadow-[inset_0_0_0_1px_rgba(246,242,74,0.06)]">
                    Built for analytics engineering, ops, and BI teams
                  </div>
                </div>
              </div>

              <div className="mt-10 grid gap-4 md:grid-cols-3">
                <div className="rounded-[28px] border border-white/10 bg-black/35 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#f6f24a]">01 Lakehouse</p>
                  <p className="mt-4 text-xl font-semibold text-white">Files, SQL, Delta, Catalog</p>
                  <p className="mt-3 text-sm leading-6 text-white/58">Ingest local and object-backed assets, preview schemas, and publish curated Delta outputs.</p>
                </div>
                <div className="rounded-[28px] border border-white/10 bg-black/35 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#f6f24a]">02 Pipelines</p>
                  <p className="mt-4 text-xl font-semibold text-white">Visual jobs with scheduling</p>
                  <p className="mt-3 text-sm leading-6 text-white/58">Build joins, aggregations, retries, logs, and recurring runs through a low-code canvas.</p>
                </div>
                <div className="rounded-[28px] border border-white/10 bg-black/35 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#f6f24a]">03 BI Layer</p>
                  <p className="mt-4 text-xl font-semibold text-white">Charts, dashboards, reports</p>
                  <p className="mt-3 text-sm leading-6 text-white/58">Model semantic datasets, assemble dashboards, and schedule exported report artifacts.</p>
                </div>
              </div>
            </section>

            <section className="flex items-center">
              <Panel className="w-full rounded-[36px] border border-white/10 bg-[#121212] p-8 text-white shadow-[0_28px_90px_rgba(0,0,0,0.45)] md:p-9">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <BrandLogo
                      className="h-14 w-14 rounded-2xl border border-white/10 bg-[#111111] p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                      imageClassName="h-full w-full"
                      variant="icon"
                    />
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">Workspace Access</p>
                      <p className="mt-2 font-display text-3xl leading-none text-white">Sign in to DataWizz</p>
                      <p className="mt-3 max-w-md text-sm leading-6 text-white/68">
                        Enter the analytics workspace for lakehouse operations, orchestration, dashboards, and reporting.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 grid gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
                  <div className="grid gap-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">Email</label>
                    <Input
                      className="h-14 rounded-2xl border-white/10 bg-[#0d0d0d] px-4 text-base text-white placeholder:text-white/30 focus:border-[#f6f24a] focus:ring-[#f6f24a]/15"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="admin@datawizz.local"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">Password</label>
                    <Input
                      className="h-14 rounded-2xl border-white/10 bg-[#0d0d0d] px-4 text-base text-white placeholder:text-white/30 focus:border-[#f6f24a] focus:ring-[#f6f24a]/15"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="datawizz123"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={loginMutation.isPending}
                    onClick={() => loginMutation.mutate({ email, password })}
                    className="mt-2 inline-flex h-14 w-full items-center justify-center rounded-2xl bg-[#f6f24a] px-5 text-base font-semibold text-black transition hover:bg-[#fff968] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loginMutation.isPending ? 'Signing In...' : 'Enter Workspace'}
                  </button>
                </div>

                <div className="mt-6 rounded-[28px] border border-[#f6f24a]/20 bg-[#f6f24a]/10 p-5 text-sm text-white">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">Access Status</p>
                  </div>
                  <p className="mt-3 leading-6 text-white/74">Use the demo credentials below to enter the workspace.</p>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 text-sm text-white/72">
                    <p className="font-semibold text-white">Demo Credentials</p>
                    <p className="mt-3 leading-6">
                      Email
                      <br />
                      <span className="font-mono text-white">admin@datawizz.local</span>
                    </p>
                    <p className="mt-3 leading-6">
                      Password
                      <br />
                      <span className="font-mono text-white">datawizz123</span>
                    </p>
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 text-sm text-white/72">
                    <p className="font-semibold text-white">Platform Snapshot</p>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-white/45">Execution Engine</span>
                        <span className="whitespace-nowrap text-right font-semibold text-white">DuckDB + Delta</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-white/45">Storage Model</span>
                        <span className="whitespace-nowrap text-right font-semibold text-white">Raw / Curated zones</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-white/45">Experience</span>
                        <span className="whitespace-nowrap text-right font-semibold text-white">Low-code + SQL</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
