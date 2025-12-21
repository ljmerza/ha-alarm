import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Search, Shield, Loader2 } from 'lucide-react'
import { Routes } from '@/lib/constants'
import { getErrorMessage } from '@/lib/errors'
import { homeAssistantService, sensorsService } from '@/services'
import { useAlarmStore } from '@/stores'
import type { HomeAssistantEntity } from '@/services/homeAssistant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { LoadingInline } from '@/components/ui/loading-inline'
import { LoadMore } from '@/components/ui/load-more'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'

function defaultEntryPointFromDeviceClass(deviceClass?: string | null): boolean {
  if (!deviceClass) return false
  return ['door', 'window', 'garage_door'].includes(deviceClass)
}

type ViewMode = 'available' | 'imported' | 'all'

export function ImportSensorsPage() {
  const entrySensorHelp =
    'Entry sensors start the entry delay (Pending) when triggered while the alarm is armed. Turn off for instant trigger.'
  const entrySensorSuggestedHelp =
    'Suggested based on the Home Assistant device class (door/window/garage_door).'

  const { sensors, fetchSensors, fetchAlarmState } = useAlarmStore()
  const [query, setQuery] = useState('')
  const [entities, setEntities] = useState<HomeAssistantEntity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ count: number; names: string[] } | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({})
  const [entryOverrides, setEntryOverrides] = useState<Record<string, boolean>>({})
  const [entryHelpOpenFor, setEntryHelpOpenFor] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitProgress, setSubmitProgress] = useState<{ current: number; total: number } | null>(
    null
  )
  const [viewMode, setViewMode] = useState<ViewMode>('available')
  const [visibleCount, setVisibleCount] = useState(50)

  const toDomId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_')

  const existingEntityIds = useMemo(() => {
    const ids = new Set<string>()
    for (const sensor of sensors) {
      if (sensor.entityId) ids.add(sensor.entityId)
    }
    return ids
  }, [sensors])

  const importedByEntityId = useMemo(() => {
    const map = new Map<string, { sensorId: number }>()
    for (const sensor of sensors) {
      if (!sensor.entityId) continue
      map.set(sensor.entityId, { sensorId: sensor.id })
    }
    return map
  }, [sensors])

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    Promise.all([fetchSensors(), homeAssistantService.getStatus()])
      .then(([, status]) => {
        if (!mounted) return
        if (!status.configured) {
          setError('Home Assistant is not configured. Set HA_URL/HA_TOKEN in .env and restart.')
          setEntities([])
          return
        }
        if (!status.reachable) {
          setError('Home Assistant is offline/unreachable. Check network and token.')
          setEntities([])
          return
        }
        return homeAssistantService.listEntities().then((list) => {
          if (!mounted) return
          setEntities(list)
        })
      })
      .catch((err) => {
        if (!mounted) return
        setError(err?.message || 'Failed to load entities')
      })
      .finally(() => {
        if (!mounted) return
        setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [fetchSensors])

  useEffect(() => {
    setVisibleCount(50)
  }, [query, viewMode])

  const allSensorEntities = useMemo(() => {
    return entities.filter((e) => e.domain.endsWith('sensor'))
  }, [entities])

  const importedSensorEntities = useMemo(() => {
    return allSensorEntities.filter((e) => existingEntityIds.has(e.entityId))
  }, [allSensorEntities, existingEntityIds])

  const availableSensorEntities = useMemo(() => {
    return allSensorEntities.filter((e) => !existingEntityIds.has(e.entityId))
  }, [allSensorEntities, existingEntityIds])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base =
      viewMode === 'available'
        ? availableSensorEntities
        : viewMode === 'imported'
          ? importedSensorEntities
          : allSensorEntities
    return base
      .filter((e) => !q || e.entityId.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [availableSensorEntities, importedSensorEntities, allSensorEntities, query, viewMode])

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  const selectedEntities = useMemo(() => {
    return filtered.filter((e) => selected[e.entityId])
  }, [filtered, selected])

  const submit = async () => {
    setError(null)
    setSuccess(null)
    setIsSubmitting(true)
    setSubmitProgress({ current: 0, total: selectedEntities.length })
    const importedNames: string[] = []
    try {
      let index = 0
      for (const entity of selectedEntities) {
        index += 1
        setSubmitProgress({ current: index, total: selectedEntities.length })
        const name = (nameOverrides[entity.entityId] || entity.name || entity.entityId).trim()
        const isEntryPoint =
          entryOverrides[entity.entityId] ?? defaultEntryPointFromDeviceClass(entity.deviceClass)

        await sensorsService.createSensor({
          name,
          entityId: entity.entityId,
          isActive: true,
          isEntryPoint,
        })
        importedNames.push(name || entity.entityId)
      }

      await fetchSensors()
      await fetchAlarmState()
      setSelected({})
      setSuccess({ count: importedNames.length, names: importedNames.slice(0, 5) })
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to import sensors')
    } finally {
      setIsSubmitting(false)
      setSubmitProgress(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Sensors"
        description={
          <>
            Add Home Assistant <code>sensor</code> and <code>binary_sensor</code> entities to your alarm system.
          </>
        }
        actions={
          <Button asChild variant="outline">
            <Link to={Routes.HOME}>
              <Shield />
              Back to Home
            </Link>
          </Button>
        }
      />

      <SectionCard title="Search" description="Select which entities to import." contentClassName="flex flex-col gap-3">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or entity_id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">View</span>
          <Button
            type="button"
            size="sm"
            variant={viewMode === 'available' ? 'secondary' : 'outline'}
            onClick={() => setViewMode('available')}
          >
            Available ({availableSensorEntities.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === 'imported' ? 'secondary' : 'outline'}
            onClick={() => setViewMode('imported')}
          >
            Imported ({importedSensorEntities.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === 'all' ? 'secondary' : 'outline'}
            onClick={() => setViewMode('all')}
          >
            All ({allSensorEntities.length})
          </Button>
        </div>
      </SectionCard>

      {success && (
        <Alert variant="success" layout="banner">
          <AlertDescription>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              Imported {success.count} sensor{success.count === 1 ? '' : 's'}.
            </div>
            {success.names.length > 0 && (
              <div className="mt-1 text-xs opacity-90">
                Examples: {success.names.join(', ')}
                {success.count > success.names.length ? '…' : ''}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="error" layout="banner">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <SectionCard
        title="Entities"
        description="Select the sensors you want the alarm to react to. “Entry sensor” means it starts the entry delay (Pending) instead of triggering instantly."
      >
          {isLoading ? (
            <LoadingInline label="Loading…" />
          ) : filtered.length === 0 ? (
            <EmptyState title="No entities found." description="Try a different search query or view mode." />
          ) : (
            <div className="space-y-2">
              {visible.map((entity) => {
                const already = existingEntityIds.has(entity.entityId)
                const isChecked = !!selected[entity.entityId]
                const suggestedEntry = defaultEntryPointFromDeviceClass(entity.deviceClass)
                const entry = entryOverrides[entity.entityId] ?? suggestedEntry
                const helpId = `entry-sensor-help-${toDomId(entity.entityId)}`
                const isHelpOpen = entryHelpOpenFor === entity.entityId
                const imported = importedByEntityId.get(entity.entityId)

                return (
                  <div key={entity.entityId} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex items-start gap-3">
                        <Checkbox
                          className="mt-1"
                          checked={isChecked}
                          disabled={already}
                          onChange={(e) => {
                            const nextChecked = e.target.checked
                            setSelected((prev) => ({
                              ...prev,
                              [entity.entityId]: nextChecked,
                            }))
                            if (nextChecked) {
                              setEntryOverrides((prev) =>
                                prev[entity.entityId] === undefined
                                  ? { ...prev, [entity.entityId]: suggestedEntry }
                                  : prev
                              )
                            }
                          }}
                        />
                        <div>
                          <div className="font-medium">{entity.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {entity.entityId}
                            {entity.deviceClass ? ` • ${entity.deviceClass}` : ''}
                            {entity.state ? ` • ${entity.state}` : ''}
                          </div>
                          {already && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Already imported{imported?.sensorId ? ` • ID: ${imported.sensorId}` : ''}
                            </div>
                          )}
                        </div>
                      </label>
                    </div>

                    {isChecked && !already && (
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-xs text-muted-foreground">Sensor name</label>
                          <Input
                            value={nameOverrides[entity.entityId] ?? entity.name}
                            onChange={(e) =>
                              setNameOverrides((prev) => ({
                                ...prev,
                                [entity.entityId]: e.target.value,
                              }))
                            }
                          />
                        </div>

	                        <div className="space-y-1">
	                          <div className="flex items-center justify-between gap-2">
	                            <label className="text-xs text-muted-foreground">Entry sensor</label>
                            <button
                              type="button"
                              className="text-xs text-muted-foreground underline"
                              aria-controls={helpId}
                              aria-expanded={isHelpOpen}
                              onClick={() =>
                                setEntryHelpOpenFor((prev) =>
                                  prev === entity.entityId ? null : entity.entityId
                                )
                              }
                            >
                              Help
                            </button>
	                          </div>
	                          <div className="flex items-center gap-2">
	                            <Switch
	                              checked={!!entry}
	                              onCheckedChange={(checked) =>
	                                setEntryOverrides((prev) => ({
	                                  ...prev,
	                                  [entity.entityId]: checked,
	                                }))
	                              }
	                              aria-labelledby={`entry-sensor-label-${toDomId(entity.entityId)}`}
	                            />
	                            <span id={`entry-sensor-label-${toDomId(entity.entityId)}`} className="text-sm">
	                              {suggestedEntry ? 'On (suggested)' : 'Off'}
	                            </span>
	                          </div>
	                          {isHelpOpen && (
	                            <div id={helpId} className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
	                              <div>{entrySensorHelp}</div>
	                              <div className="mt-1">{entrySensorSuggestedHelp}</div>
	                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {visibleCount < filtered.length && (
                <LoadMore onClick={() => setVisibleCount((c) => c + 50)} />
              )}
            </div>
          )}
      </SectionCard>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Selected: {selectedEntities.length}
          {submitProgress ? ` • Importing ${submitProgress.current}/${submitProgress.total}` : ''}
        </div>
        <Button
          type="button"
          disabled={isSubmitting || selectedEntities.length === 0}
          onClick={submit}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing…
            </>
          ) : (
            'Import selected'
          )}
        </Button>
      </div>
    </div>
  )
}

export default ImportSensorsPage
