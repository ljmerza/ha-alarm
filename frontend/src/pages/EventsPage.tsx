import { PageHeader } from '@/components/ui/page-header'
import { PlaceholderCard } from '@/components/ui/placeholder-card'

export function EventsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Events" />
      <PlaceholderCard title="Event History" message="Event history will be implemented in Phase 7." />
    </div>
  )
}

export default EventsPage
