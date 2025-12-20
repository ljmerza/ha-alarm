import { AlarmPanel } from '@/components/alarm'
import { QuickLinksCard } from '@/components/dashboard/QuickLinksCard'
import { SystemStatusCard } from '@/components/dashboard/SystemStatusCard'

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Home</h1>
        <p className="text-muted-foreground">Arm/disarm and review recent activity.</p>
      </div>

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
