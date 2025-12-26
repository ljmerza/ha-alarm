import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Activity, AlertTriangle, Key, Shield, ShieldAlert, ShieldOff } from 'lucide-react'
import { Page } from '@/components/layout'
import { SectionCard } from '@/components/ui/section-card'
import { Select } from '@/components/ui/select'
import { DateTimeRangePicker } from '@/components/ui/date-time-range-picker'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { FormField } from '@/components/ui/form-field'
import { LoadingInline } from '@/components/ui/loading-inline'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { EventType } from '@/lib/constants'
import type { EventTypeType } from '@/lib/constants'
import type { AlarmEvent } from '@/types'
import { useEventsInfiniteQuery } from '@/hooks/useEventsQueries'

function toUtcIsoFromDatetimeLocal(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

const eventTypeOptions: { value: string; label: string }[] = [
  { value: '', label: 'All events' },
  { value: EventType.ARMED, label: 'Armed' },
  { value: EventType.DISARMED, label: 'Disarmed' },
  { value: EventType.PENDING, label: 'Entry delay' },
  { value: EventType.TRIGGERED, label: 'Triggered' },
  { value: EventType.CODE_USED, label: 'Code used' },
  { value: EventType.FAILED_CODE, label: 'Failed code' },
  { value: EventType.SENSOR_TRIGGERED, label: 'Sensor triggered' },
  { value: EventType.STATE_CHANGED, label: 'State changed' },
]

const eventConfig: Record<
  string,
  {
    icon: React.ElementType
    colorClassName: string
    label: string
  }
> = {
  [EventType.ARMED]: {
    icon: Shield,
    colorClassName: 'text-[color:var(--color-alarm-armed-away)]',
    label: 'Armed',
  },
  [EventType.DISARMED]: {
    icon: ShieldOff,
    colorClassName: 'text-[color:var(--color-alarm-disarmed)]',
    label: 'Disarmed',
  },
  [EventType.TRIGGERED]: {
    icon: ShieldAlert,
    colorClassName: 'text-[color:var(--color-alarm-triggered)]',
    label: 'Triggered',
  },
  [EventType.CODE_USED]: { icon: Key, colorClassName: 'text-primary', label: 'Code used' },
  [EventType.SENSOR_TRIGGERED]: {
    icon: Activity,
    colorClassName: 'text-[color:var(--color-alarm-pending)]',
    label: 'Sensor triggered',
  },
  [EventType.FAILED_CODE]: {
    icon: AlertTriangle,
    colorClassName: 'text-[color:var(--color-alarm-armed-home)]',
    label: 'Failed code',
  },
  [EventType.PENDING]: {
    icon: AlertTriangle,
    colorClassName: 'text-[color:var(--color-alarm-pending)]',
    label: 'Entry delay',
  },
  [EventType.STATE_CHANGED]: { icon: Shield, colorClassName: 'text-muted-foreground', label: 'State changed' },
}

function formatEventTimeRelative(timestamp: string): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
  } catch {
    return timestamp
  }
}

function formatEventTimeAbsolute(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString()
  } catch {
    return timestamp
  }
}

function getMetadataSummary(metadata: Record<string, unknown>): string | null {
  const action = typeof metadata.action === 'string' ? metadata.action : null
  const reason = typeof metadata.reason === 'string' ? metadata.reason : null
  const source = typeof metadata.source === 'string' ? metadata.source : null
  return action || reason || source
}

function EventRow({ event }: { event: AlarmEvent }) {
  const config = eventConfig[event.eventType] || {
    icon: Activity,
    colorClassName: 'text-muted-foreground',
    label: event.eventType,
  }
  const Icon = config.icon

  const metaSummary = getMetadataSummary(event.metadata)
  const details = [
    event.stateTo ? `${event.stateFrom ? `${event.stateFrom} → ` : ''}${event.stateTo}` : null,
    event.sensorId ? `sensor #${event.sensorId}` : null,
    event.userId ? `user ${event.userId}` : null,
    metaSummary ? `meta: ${metaSummary}` : null,
  ].filter(Boolean)

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className={cn('shrink-0 mt-0.5', config.colorClassName)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium truncate">{config.label}</div>
          <Tooltip content={formatEventTimeAbsolute(event.timestamp)}>
            <div className="text-sm text-muted-foreground shrink-0">{formatEventTimeRelative(event.timestamp)}</div>
          </Tooltip>
        </div>
        {details.length > 0 ? (
          <div className="text-sm text-muted-foreground truncate">{details.join(' • ')}</div>
        ) : null}
      </div>
    </div>
  )
}

export function EventsPage() {
  const [eventType, setEventType] = useState<string>('')
  const [range, setRange] = useState<{ start: string; end: string }>({ start: '', end: '' })

  const filters = useMemo(() => {
    const startDate = toUtcIsoFromDatetimeLocal(range.start)
    const endDate = toUtcIsoFromDatetimeLocal(range.end)
    return {
      eventType: (eventType || undefined) as EventTypeType | undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }
  }, [eventType, range.end, range.start])

  const eventsQuery = useEventsInfiniteQuery(filters, 50)

  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [eventsQuery.data]
  )
  const pages = eventsQuery.data?.pages ?? []
  const total = pages[0]?.total ?? 0
  const lastPage = pages[pages.length - 1]
  const hasNext = lastPage?.hasNext ?? false

  const isLoading = eventsQuery.isLoading
  const isFetchingMore = eventsQuery.isFetchingNextPage
  const error = (eventsQuery.error as { message?: string } | null)?.message || null

  const clearFilters = () => {
    setEventType('')
    setRange({ start: '', end: '' })
  }

  return (
    <Page title="Events">
      <SectionCard
        title="Filters"
        description="Narrow down event history by type and time window."
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => eventsQuery.refetch()} disabled={isLoading}>
              Refresh
            </Button>
            <Button type="button" variant="secondary" onClick={clearFilters} disabled={isLoading}>
              Clear
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Event type" htmlFor="event-type">
            <Select id="event-type" value={eventType} onChange={(e) => setEventType(e.target.value)}>
              {eventTypeOptions.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>
          <DateTimeRangePicker label="Time window" value={range} onChange={setRange} />
        </div>
      </SectionCard>

      <SectionCard
        title="Event history"
        description={total ? `${total} total` : 'Most recent events first.'}
      >
        {error ? (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <div className="py-6">
            <LoadingInline label="Loading events…" />
          </div>
        ) : events.length === 0 ? (
          <EmptyState title="No events" description="Try widening the time window or clearing filters." />
        ) : (
          <div className="space-y-1">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        )}

        {hasNext ? (
          <div className="pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => eventsQuery.fetchNextPage()}
              disabled={isLoading || isFetchingMore}
            >
              {isFetchingMore ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        ) : null}
      </SectionCard>
    </Page>
  )
}

export default EventsPage
