import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { queryKeys } from '@/types'
import { useWebSocketStatus, useAlarmStateQuery, useSensorsQuery, useRecentEventsQuery, useHomeAssistantStatus } from '@/hooks'

function formatTimestamp(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

export function SystemStatusCard() {
  const queryClient = useQueryClient()
  const wsStatus = useWebSocketStatus().data

  const alarmStateQuery = useAlarmStateQuery()
  const sensorsQuery = useSensorsQuery()
  const recentEventsQuery = useRecentEventsQuery(10)

  const alarmState = alarmStateQuery.data ?? null
  const isLoading = alarmStateQuery.isFetching || sensorsQuery.isFetching || recentEventsQuery.isFetching

  const haQuery = useHomeAssistantStatus()

  const ha =
    haQuery.data ??
    (haQuery.isError ? { configured: true, reachable: false, error: 'Failed to check status' } : null)

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
              void queryClient.invalidateQueries({ queryKey: queryKeys.alarm.state })
              void queryClient.invalidateQueries({ queryKey: queryKeys.sensors.all })
              void queryClient.invalidateQueries({ queryKey: queryKeys.events.recent })
              void queryClient.invalidateQueries({ queryKey: queryKeys.homeAssistant.status })
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
