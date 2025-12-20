import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, TriangleAlert } from 'lucide-react'
import { Routes as AppRoutes } from '@/lib/constants'
import { useAlarmStore } from '@/stores'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function ZoneSummaryCard() {
  const { zones } = useAlarmStore()

  const summary = useMemo(() => {
    const activeZones = zones.filter((z) => z.isActive)
    const allSensors = activeZones.flatMap((z) => z.sensors || [])
    const openSensors = allSensors.filter((s) => s.isActive && s.currentState === 'open')
    const bypassedZones = activeZones.filter((z) => z.isBypassed)

    const attentionZones = (() => {
      const zoneToOpenCount = new Map<number, number>()
      for (const sensor of openSensors) {
        zoneToOpenCount.set(sensor.zoneId, (zoneToOpenCount.get(sensor.zoneId) || 0) + 1)
      }
      return activeZones
        .filter((z) => z.isBypassed || zoneToOpenCount.has(z.id))
        .map((z) => ({
          id: z.id,
          name: z.name,
          openCount: zoneToOpenCount.get(z.id) || 0,
          bypassed: z.isBypassed,
        }))
        .sort((a, b) => {
          if (a.openCount !== b.openCount) return b.openCount - a.openCount
          if (a.bypassed !== b.bypassed) return a.bypassed ? 1 : -1
          return a.name.localeCompare(b.name)
        })
        .slice(0, 3)
    })()

    return {
      zoneCount: activeZones.length,
      sensorCount: allSensors.length,
      openSensorCount: openSensors.length,
      bypassedZoneCount: bypassedZones.length,
      attentionZones,
    }
  }, [zones])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Zones</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link to={AppRoutes.ZONES}>
              <MapPin />
              View
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="rounded-md border p-2">
            <div className="font-medium text-foreground">Active Zones</div>
            <div>{summary.zoneCount}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="font-medium text-foreground">Sensors</div>
            <div>{summary.sensorCount}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="font-medium text-foreground">Open Sensors</div>
            <div>{summary.openSensorCount}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="font-medium text-foreground">Bypassed Zones</div>
            <div>{summary.bypassedZoneCount}</div>
          </div>
        </div>

        {summary.attentionZones.length > 0 ? (
          <div className="rounded-md border p-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TriangleAlert className="h-4 w-4 text-amber-500" />
              Attention
            </div>
            <div className="mt-2 space-y-1 text-sm">
              {summary.attentionZones.map((zone) => (
                <div key={zone.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{zone.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {zone.openCount > 0 ? `${zone.openCount} open` : ''}
                    {zone.openCount > 0 && zone.bypassed ? ' • ' : ''}
                    {zone.bypassed ? 'bypassed' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border p-2 text-sm text-muted-foreground">
            No zone warnings right now.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default ZoneSummaryCard
