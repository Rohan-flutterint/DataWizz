import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth-context'
import { EmptyState, PageHeader } from '../components/ui'

export function RequireRole({ roles }: { roles: string[] }) {
  const { hasAnyRole, isReady } = useAuth()
  const location = useLocation()

  if (!isReady) {
    return null
  }

  if (!hasAnyRole(...roles)) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Access Control"
          title="Read-only role"
          description="This section is reserved for workspace builders and administrators."
        />
        <EmptyState
          title="Additional permissions required"
          description={`Your current role cannot access ${location.pathname}. Sign in with an analyst or admin account to continue.`}
        />
      </div>
    )
  }

  return <Outlet />
}
