import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ZonesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Zones</h1>
      <Card>
        <CardHeader>
          <CardTitle>Zone Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Zone management will be implemented in Phase 5.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default ZonesPage
