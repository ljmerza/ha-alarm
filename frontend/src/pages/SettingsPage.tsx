import { PageHeader } from '@/components/ui/page-header'
import { PlaceholderCard } from '@/components/ui/placeholder-card'

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <PlaceholderCard title="System Settings" message="Settings will be implemented in Phase 8." />
    </div>
  )
}

export default SettingsPage
