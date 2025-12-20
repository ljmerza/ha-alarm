import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Search, Shield, MapPin, Loader2 } from 'lucide-react'
import { Routes } from '@/lib/constants'
import { homeAssistantService, zonesService } from '@/services'
import { useAlarmStore } from '@/stores'
import type { HomeAssistantEntity } from '@/services/homeAssistant'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function defaultEntryPointFromDeviceClass(deviceClass?: string | null): boolean {
  if (!deviceClass) return false
  return ['door', 'window', 'garage_door'].includes(deviceClass)
}

export function ImportSensorsPage() {
  const { zones, fetchZones, fetchAlarmState } = useAlarmStore()
  const [query, setQuery] = useState('')
  const [entities, setEntities] = useState<HomeAssistantEntity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({})
  const [entryOverrides, setEntryOverrides] = useState<Record<string, boolean>>({})
  const [zoneId, setZoneId] = useState<number | 'unassigned' | 'new'>('unassigned')
  const [newZoneName, setNewZoneName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const existingEntityIds = useMemo(() => {
    const ids = new Set<string>()
    for (const zone of zones) {
      for (const sensor of zone.sensors || []) {
        if (sensor.entityId) ids.add(sensor.entityId)
      }
    }
    return ids
  }, [zones])

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setError(null)

    Promise.all([fetchZones(), homeAssistantService.getStatus()])
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
  }, [fetchZones])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entities
      .filter((e) => e.domain === 'binary_sensor')
      .filter((e) => !q || e.entityId.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [entities, query])

  const selectedEntities = useMemo(() => {
    return filtered.filter((e) => selected[e.entityId])
  }, [filtered, selected])

  const submit = async () => {
    setError(null)
    setIsSubmitting(true)
    try {
      const targetZoneId = await (async () => {
        if (zoneId === 'unassigned') return undefined
        if (zoneId !== 'new') return zoneId
        const trimmed = newZoneName.trim()
        if (!trimmed) {
          throw new Error('Zone name is required.')
        }
        const created = await zonesService.createZone({
          name: trimmed,
          isActive: true,
          activeStates: [],
        })
        return created.id
      })()

      for (const entity of selectedEntities) {
        const name = (nameOverrides[entity.entityId] || entity.name || entity.entityId).trim()
        const isEntryPoint =
          entryOverrides[entity.entityId] ??
          defaultEntryPointFromDeviceClass(entity.deviceClass)

        await zonesService.createSensor({
          name,
          entityId: entity.entityId,
          isActive: true,
          isEntryPoint,
          ...(targetZoneId ? { zoneId: targetZoneId } : {}),
        })
      }

      await fetchZones()
      await fetchAlarmState()
      setSelected({})
      if (zoneId === 'new') {
        setZoneId('unassigned')
        setNewZoneName('')
      }
    } catch (err) {
      if (err && typeof err === 'object') {
        const anyErr = err as { message?: string; detail?: string }
        setError(anyErr.detail || anyErr.message || 'Failed to import sensors')
      } else {
        setError('Failed to import sensors')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Import Sensors</h1>
          <p className="text-muted-foreground">
            Select Home Assistant <code>binary_sensor</code> entities to use in the alarm.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to={Routes.HOME}>
            <Shield />
            Back to Home
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Options</CardTitle>
          <CardDescription>Zones are optional; imported sensors will go to “Unassigned” by default.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search entities…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm text-muted-foreground">Zone</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={zoneId}
              onChange={(e) =>
                setZoneId(
                  e.target.value === 'unassigned'
                    ? 'unassigned'
                    : e.target.value === 'new'
                      ? 'new'
                      : Number(e.target.value)
                )
              }
            >
              <option value="unassigned">Unassigned (default)</option>
              <option value="new">New zone…</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {zoneId === 'new' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Zone</CardTitle>
            <CardDescription>Create a zone and import selected sensors into it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <label className="text-sm font-medium" htmlFor="newZoneName">
              Zone name
            </label>
            <Input
              id="newZoneName"
              placeholder="Perimeter"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              disabled={isSubmitting}
            />
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Entities</CardTitle>
            <Button
              disabled={isSubmitting || selectedEntities.length === 0}
              onClick={submit}
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : <Check />}
              Import {selectedEntities.length || ''}
            </Button>
          </div>
          <CardDescription>Only <code>binary_sensor</code> entities are shown for MVP.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No entities found.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((entity) => {
                const already = existingEntityIds.has(entity.entityId)
                const isChecked = !!selected[entity.entityId]
                const suggestedEntry = defaultEntryPointFromDeviceClass(entity.deviceClass)
                const entry =
                  entryOverrides[entity.entityId] ?? suggestedEntry

                return (
                  <div
                    key={entity.entityId}
                    className="rounded-md border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={isChecked}
                          disabled={already}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [entity.entityId]: e.target.checked,
                            }))
                          }
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
                              Already imported
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
                          <label className="text-xs text-muted-foreground">Entry sensor</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={entry}
                              onChange={(e) =>
                                setEntryOverrides((prev) => ({
                                  ...prev,
                                  [entity.entityId]: e.target.checked,
                                }))
                              }
                            />
                            <span className="text-sm">
                              {suggestedEntry ? 'Suggested' : 'Off'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ImportSensorsPage
