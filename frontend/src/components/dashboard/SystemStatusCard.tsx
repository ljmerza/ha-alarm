import { useEffect, useMemo, useState } from 'react'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { useAlarmStore } from '@/stores'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { homeAssistantService } from '@/services'

function formatTimestamp(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

export function SystemStatusCard() {
  const { wsStatus, alarmState, isLoading, fetchAlarmState, fetchSensors, fetchRecentEvents } =
    useAlarmStore()
  const [ha, setHa] = useState<{
    configured: boolean
    reachable: boolean
    error?: string | null
  } | null>(null)

  const statusLabel = useMemo(() => {
    switch (wsStatus) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting…'
      case 'error':
        return 'Error'
      case 'disconnected':
      default:
        return 'Offline'
    }
  }, [wsStatus])

  const StatusIcon = wsStatus === 'connected' ? Wifi : WifiOff

  useEffect(() => {
    let isMounted = true
    homeAssistantService
      .getStatus()
      .then((status) => {
        if (!isMounted) return
        setHa(status)
      })
      .catch(() => {
        if (!isMounted) return
        setHa({ configured: true, reachable: false, error: 'Failed to check status' })
      })
    return () => {
      isMounted = false
    }
  }, [])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">System Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon
              className={cn(
                'h-4 w-4',
                wsStatus === 'connected' ? 'text-emerald-500' : 'text-muted-foreground'
              )}
            />
            <span className="text-sm">{statusLabel}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isLoading}
            onClick={() => {
              fetchAlarmState()
              fetchSensors()
              fetchRecentEvents()
              homeAssistantService
                .getStatus()
                .then((status) => setHa(status))
                .catch(() =>
                  setHa({ configured: true, reachable: false, error: 'Failed to check status' })
                )
            }}
          >
            <RefreshCw />
            Refresh
          </Button>
        </div>

        {ha && (
          <div className="rounded-md border p-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Home Assistant</span>
              <span className={cn('text-xs', ha.reachable ? 'text-emerald-600' : 'text-muted-foreground')}>
                {!ha.configured ? 'Not configured' : ha.reachable ? 'Connected' : 'Offline'}
              </span>
            </div>
            {ha.configured && !ha.reachable && ha.error && (
              <div className="mt-1 text-xs text-muted-foreground">{ha.error}</div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="rounded-md border p-2">
            <div className="font-medium text-foreground">State Since</div>
            <div>{formatTimestamp(alarmState?.enteredAt)}</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="font-medium text-foreground">Next Transition</div>
            <div>{formatTimestamp(alarmState?.exitAt)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default SystemStatusCard
