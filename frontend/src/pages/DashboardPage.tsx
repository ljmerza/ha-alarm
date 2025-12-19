import { useAlarm } from '@/hooks'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlarmPanel } from '@/components/alarm'

export function DashboardPage() {
  const { zones, wsStatus } = useAlarm()

  const activeZones = zones.filter((z) => z.isActive && !z.isBypassed)
  const bypassedZones = zones.filter((z) => z.isBypassed)
  const openSensors = zones
    .flatMap((z) => z.sensors)
    .filter((s) => s.currentState === 'open')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Badge variant={wsStatus === 'connected' ? 'default' : 'secondary'}>
          {wsStatus === 'connected' ? 'Live' : 'Connecting...'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Alarm Panel */}
        <div className="lg:col-span-2">
          <AlarmPanel />
        </div>

        {/* Sidebar Stats */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">System Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Zones</span>
                <span className="font-semibold">{activeZones.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Bypassed Zones</span>
                <span className="font-semibold">{bypassedZones.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Open Sensors</span>
                <span className={openSensors.length > 0 ? 'font-semibold text-amber-500' : 'font-semibold'}>
                  {openSensors.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Connection</span>
                <span className={wsStatus === 'connected' ? 'font-semibold text-green-500' : 'font-semibold text-amber-500'}>
                  {wsStatus === 'connected' ? 'Online' : 'Reconnecting'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Open Sensors Warning */}
          {openSensors.length > 0 && (
            <Card className="border-amber-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-amber-500">Open Sensors</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {openSensors.map((sensor) => (
                    <li key={sensor.id} className="text-sm">
                      {sensor.name}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Bypassed Zones */}
          {bypassedZones.length > 0 && (
            <Card className="border-muted">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-muted-foreground">Bypassed Zones</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {bypassedZones.map((zone) => (
                    <li key={zone.id} className="text-sm text-muted-foreground">
                      {zone.name}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
