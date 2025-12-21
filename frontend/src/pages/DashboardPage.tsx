import { AlarmPanel } from '@/components/alarm'
import { QuickLinksCard } from '@/components/dashboard/QuickLinksCard'
import { SystemStatusCard } from '@/components/dashboard/SystemStatusCard'
import { PageHeader } from '@/components/ui/page-header'

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Home" description="Arm/disarm and review recent activity." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AlarmPanel />
        </div>
        <div className="space-y-6">
          <SystemStatusCard />
          <QuickLinksCard />
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
