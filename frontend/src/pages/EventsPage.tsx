import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function EventsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Events</h1>
      <Card>
        <CardHeader>
          <CardTitle>Event History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Event history will be implemented in Phase 7.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default EventsPage
