import { useQueryClient } from '@tanstack/react-query'
import { AlarmPanel } from '@/components/alarm'
import { QuickLinksCard } from '@/components/dashboard/QuickLinksCard'
import { SystemStatusCard } from '@/components/dashboard/SystemStatusCard'
import { PageHeader } from '@/components/ui/page-header'
import { FeatureErrorBoundary } from '@/components/providers/FeatureErrorBoundary'
import { queryKeys } from '@/types'

export function DashboardPage() {
  const queryClient = useQueryClient()

  const handleAlarmRetry = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.alarm.state })
    void queryClient.invalidateQueries({ queryKey: queryKeys.sensors.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.events.recent })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Home" description="Arm/disarm and review recent activity." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FeatureErrorBoundary feature="Alarm Panel" onRetry={handleAlarmRetry}>
            <AlarmPanel />
          </FeatureErrorBoundary>
        </div>
        <div className="space-y-6">
          <FeatureErrorBoundary feature="System Status" variant="inline">
            <SystemStatusCard />
          </FeatureErrorBoundary>
          <FeatureErrorBoundary feature="Quick Links" variant="inline">
            <QuickLinksCard />
          </FeatureErrorBoundary>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
