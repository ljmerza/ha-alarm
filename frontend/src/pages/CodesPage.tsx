import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function CodesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Codes</h1>
      <Card>
        <CardHeader>
          <CardTitle>Code Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Code management will be implemented in Phase 6.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default CodesPage
