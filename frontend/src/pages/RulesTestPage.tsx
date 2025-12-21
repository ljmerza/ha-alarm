import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { entitiesService, rulesService } from '@/services'
import type { Entity } from '@/types'
import { Tooltip } from '@/components/ui/tooltip'
import { Link } from 'react-router-dom'
import { Routes } from '@/lib/constants'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'
import { HelpTip } from '@/components/ui/help-tip'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DatalistInput } from '@/components/ui/datalist-input'
import { EmptyState } from '@/components/ui/empty-state'
import { getErrorMessage } from '@/lib/errors'
import type { RuleSimulateResult } from '@/types'

type Row = { id: string; entityId: string; state: string }

function uniqueId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

type SavedScenario = {
  name: string
  rows: Row[]
  assumeForSeconds: string
}

type SimulatedRule = {
  id: number
  name: string
  kind: string
  priority: number
  matched?: boolean
  trace?: unknown
  actions?: unknown
  for?: { status?: string; seconds?: number } | null
}

type SimulationResult = RuleSimulateResult

const storageKey = 'alarm_rules_test_scenarios'

function loadSavedScenarios(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s) => s && typeof s.name === 'string' && Array.isArray(s.rows)) as SavedScenario[]
  } catch {
    return []
  }
}

function saveSavedScenarios(scenarios: SavedScenario[]) {
  localStorage.setItem(storageKey, JSON.stringify(scenarios))
}

export function RulesTestPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [rows, setRows] = useState<Row[]>([{ id: uniqueId(), entityId: '', state: 'on' }])
  const [mode, setMode] = useState<'scenario' | 'delta'>('scenario')
  const [deltaEntityId, setDeltaEntityId] = useState('')
  const [deltaState, setDeltaState] = useState('on')
  const [assumeForSeconds, setAssumeForSeconds] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [baselineResult, setBaselineResult] = useState<SimulationResult | null>(null)
  const [scenarioName, setScenarioName] = useState('')
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([])
  const [selectedScenario, setSelectedScenario] = useState<string>('')
  const [ruleSearch, setRuleSearch] = useState('')
  const [showOnlyMatched, setShowOnlyMatched] = useState(false)

  const entityIdOptions = useMemo(() => entities.map((e) => e.entityId), [entities])
  const entitiesById = useMemo(() => {
    const map = new Map<string, Entity>()
    for (const e of entities) map.set(e.entityId, e)
    return map
  }, [entities])

  useEffect(() => {
    setSavedScenarios(loadSavedScenarios())
  }, [])

  const refreshEntities = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const list = await entitiesService.list()
      setEntities(list)
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to load entities')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setError(null)
    entitiesService
      .list()
      .then((list) => {
        if (!mounted) return
        setEntities(list)
      })
      .catch((err) => {
        if (!mounted) return
        setError(getErrorMessage(err) || 'Failed to load entities')
      })
      .finally(() => {
        if (!mounted) return
        setIsLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const syncEntities = async () => {
    setError(null)
    setIsLoading(true)
    try {
      await entitiesService.sync()
      await refreshEntities()
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to sync entities')
      setIsLoading(false)
    }
  }

  const entityStates = useMemo(() => {
    const out: Record<string, string> = {}
    for (const row of rows) {
      const entityId = row.entityId.trim()
      const state = row.state.trim()
      if (!entityId || !state) continue
      out[entityId] = state
    }
    return out
  }, [rows])

  const deltaEntityStates = useMemo(() => {
    const entityId = deltaEntityId.trim()
    const state = deltaState.trim()
    if (!entityId || !state) return {}
    return { [entityId]: state }
  }, [deltaEntityId, deltaState])

  const setRowEntityId = (rowId: string, nextEntityId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r
        const entity = entitiesById.get(nextEntityId.trim())
        const baseline = entity?.lastState ?? ''
        const shouldAutofill = r.entityId.trim() !== nextEntityId.trim() && (r.state.trim() === '' || r.state === 'on')
        return {
          ...r,
          entityId: nextEntityId,
          state: shouldAutofill && baseline ? baseline : r.state,
        }
      })
    )
  }

  const simulate = async () => {
    setIsRunning(true)
    setError(null)
    setResult(null)
    try {
      const assume =
        assumeForSeconds.trim() === '' ? undefined : Number.parseInt(assumeForSeconds.trim(), 10)
      if (assumeForSeconds.trim() !== '' && (assume == null || Number.isNaN(assume))) {
        setError('Assume-for seconds must be a number.')
        return
      }
      const res = await rulesService.simulate({ entityStates, assumeForSeconds: assume })
      setResult(res as SimulationResult)
    } catch (err) {
      setError(getErrorMessage(err) || 'Simulation failed')
    } finally {
      setIsRunning(false)
    }
  }

  const simulateDelta = async () => {
    setIsRunning(true)
    setError(null)
    setResult(null)
    setBaselineResult(null)
    try {
      const assume =
        assumeForSeconds.trim() === '' ? undefined : Number.parseInt(assumeForSeconds.trim(), 10)
      if (assumeForSeconds.trim() !== '' && (assume == null || Number.isNaN(assume))) {
        setError('Assume-for seconds must be a number.')
        return
      }
      const base = await rulesService.simulate({ entityStates: {}, assumeForSeconds: assume })
      const changed = await rulesService.simulate({ entityStates: deltaEntityStates, assumeForSeconds: assume })
      setBaselineResult(base as SimulationResult)
      setResult(changed as SimulationResult)
    } catch (err) {
      setError(getErrorMessage(err) || 'Simulation failed')
    } finally {
      setIsRunning(false)
    }
  }

  const diff = useMemo(() => {
    if (!baselineResult || !result) return null

    type Status = 'matched' | 'would_schedule' | 'not_matched'
    type Entry = {
      id: number
      name: string
      kind: string
      priority: number
      status: Status
      trace: unknown
      actions: unknown
      forInfo?: unknown
    }

    const normalize = (res: SimulationResult) => {
      const out = new Map<number, Entry>()
      const matchedRules = Array.isArray(res.matchedRules) ? res.matchedRules : []
      const nonMatching = Array.isArray(res.nonMatchingRules) ? res.nonMatchingRules : []
      for (const r of matchedRules) {
        const status: Status =
          r.matched === true ? 'matched' : r.for?.status === 'would_schedule' ? 'would_schedule' : 'not_matched'
        out.set(r.id, {
          id: r.id,
          name: r.name,
          kind: r.kind,
          priority: r.priority,
          status,
          trace: r.trace,
          actions: r.actions,
          forInfo: r.for,
        })
      }
      for (const r of nonMatching) {
        if (out.has(r.id)) continue
        out.set(r.id, {
          id: r.id,
          name: r.name,
          kind: r.kind,
          priority: r.priority,
          status: 'not_matched',
          trace: r.trace,
          actions: r.actions,
        })
      }
      return out
    }

    const baseMap = normalize(baselineResult)
    const changedMap = normalize(result)
    const changedRules: Array<{ id: number; from: Entry; to: Entry }> = []

    const allIds = new Set<number>([...baseMap.keys(), ...changedMap.keys()])
    for (const id of allIds) {
      const from = baseMap.get(id)
      const to = changedMap.get(id)
      if (!from || !to) continue
      if (from.status !== to.status) changedRules.push({ id, from, to })
    }

    changedRules.sort((a, b) => {
      if (a.to.priority !== b.to.priority) return b.to.priority - a.to.priority
      return a.to.name.localeCompare(b.to.name)
    })

    return { changedRules }
  }, [baselineResult, result])

  const saveScenario = () => {
    const trimmed = scenarioName.trim()
    if (!trimmed) {
      setError('Scenario name is required to save.')
      return
    }
    const next: SavedScenario = { name: trimmed, rows, assumeForSeconds }
    const updated = [next, ...savedScenarios.filter((s) => s.name !== trimmed)].slice(0, 20)
    setSavedScenarios(updated)
    saveSavedScenarios(updated)
    setSelectedScenario(trimmed)
  }

  const loadScenario = (nameToLoad: string) => {
    const found = savedScenarios.find((s) => s.name === nameToLoad)
    if (!found) return
    setRows(found.rows.length ? found.rows : [{ id: uniqueId(), entityId: '', state: 'on' }])
    setAssumeForSeconds(found.assumeForSeconds || '')
    setSelectedScenario(found.name)
    setResult(null)
    setError(null)
  }

  const deleteScenario = () => {
    if (!selectedScenario) return
    const updated = savedScenarios.filter((s) => s.name !== selectedScenario)
    setSavedScenarios(updated)
    saveSavedScenarios(updated)
    setSelectedScenario('')
  }

  const matchedRules = useMemo(() => {
    const all = Array.isArray(result?.matchedRules) ? result.matchedRules : []
    return all.filter((r) => r.matched === true)
  }, [result])

  const scheduledForRules = useMemo(() => {
    const all = Array.isArray(result?.matchedRules) ? result.matchedRules : []
    return all.filter((r) => r.matched !== true && r.for?.status === 'would_schedule')
  }, [result])

  const nonMatchingRules = useMemo(
    () => (Array.isArray(result?.nonMatchingRules) ? result.nonMatchingRules : []),
    [result]
  )

  const filterRuleList = (list: SimulatedRule[]) => {
    const q = ruleSearch.trim().toLowerCase()
    const base = showOnlyMatched ? list.filter((r) => r.matched === true) : list
    if (!q) return base
    return base.filter((r) => String(r.name || '').toLowerCase().includes(q))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Test Rules"
        description="Simulate entity states and see which rules would match (no actions executed)."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={Routes.RULES}>Back to Rules</Link>
            </Button>
            <Tooltip content="Imports/updates the local Entity Registry from Home Assistant.">
              <Button type="button" variant="outline" onClick={syncEntities} disabled={isLoading || isRunning}>
                Sync Entities
              </Button>
            </Tooltip>
            <Button type="button" variant="outline" onClick={refreshEntities} disabled={isLoading || isRunning}>
              Refresh
            </Button>
          </>
        }
      />

      {error && (
        <Alert variant="error" layout="banner">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Scenario</CardTitle>
          <CardDescription>
            Provide a set of entity state overrides for simulation.
            <HelpTip
              className="ml-2"
              content="This page is a dry-run. It never executes alarm actions or Home Assistant services."
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Mode{' '}
              <HelpTip
                className="ml-1"
                content="Scenario overrides multiple entity states at once. Single Change compares baseline vs baseline + one state change."
              />
            </span>
            <Button
              type="button"
              size="sm"
              variant={mode === 'scenario' ? 'secondary' : 'outline'}
              onClick={() => setMode('scenario')}
              disabled={isRunning}
            >
              Scenario
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'delta' ? 'secondary' : 'outline'}
              onClick={() => setMode('delta')}
              disabled={isRunning}
            >
              Single Change
            </Button>
          </div>

          {mode === 'scenario' && (
            <>
              {rows.map((row) => (
                <div key={row.id} className="grid gap-2 md:grid-cols-12 items-end">
	                  <div className="md:col-span-7 space-y-1">
	                    <label className="text-xs text-muted-foreground">
	                      Entity ID{' '}
	                      <HelpTip
	                        className="ml-1"
	                        content="Pick a Home Assistant entity_id. Use “Sync Entities” at the top if the list is empty."
	                      />
	                    </label>
	                    <DatalistInput
	                      listId="rules-test-entity-options"
	                      options={entityIdOptions}
	                      maxOptions={500}
	                      value={row.entityId}
	                      onChange={(e) => {
	                        setRowEntityId(row.id, e.target.value)
	                      }}
	                      placeholder="binary_sensor.front_door"
	                      disabled={isLoading || isRunning}
	                    />
                    {row.entityId.trim() && entitiesById.get(row.entityId.trim())?.lastState != null && (
                      <div className="text-xs text-muted-foreground">
                        Baseline: {String(entitiesById.get(row.entityId.trim())?.lastState)}
                      </div>
                    )}
                  </div>
	                  <div className="md:col-span-3 space-y-1">
	                    <label className="text-xs text-muted-foreground">
	                      State{' '}
	                      <HelpTip
	                        className="ml-1"
	                        content="The simulated state string for this entity (e.g., on/off/open/closed)."
	                      />
	                    </label>
                    <Input
                      value={row.state}
                      onChange={(e) => {
                        const value = e.target.value
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, state: value } : r))
                        )
                      }}
                      placeholder="on"
                      disabled={isLoading || isRunning}
                    />
                    <div className="flex flex-wrap gap-1 pt-1">
                      {['on', 'off', 'open', 'closed', 'locked', 'unlocked'].map((v) => (
                        <button
                          key={v}
                          type="button"
                          className="rounded border border-input bg-background px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          disabled={isRunning}
                          onClick={() =>
                            setRows((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, state: v } : r))
                            )
                          }
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={rows.length <= 1 || isRunning}
                      onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </>
          )}

          {mode === 'delta' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Single Change{' '}
                  <HelpTip
                    className="ml-1"
                    content="Runs baseline with no overrides (registry states), then runs again with one entity state override. The Results page shows differences in rule match status."
                  />
                </CardTitle>
                <CardDescription>
                  Runs a baseline simulation (current registry states), then applies one entity state change and shows what changes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 md:grid-cols-12 items-end">
	                  <div className="md:col-span-8 space-y-1">
	                    <label className="text-xs text-muted-foreground">
	                      Entity ID{' '}
	                      <HelpTip
	                        className="ml-1"
	                        content="Entity to change for the delta run. Baseline comes from the registry state."
	                      />
	                    </label>
	                    <DatalistInput
	                      listId="rules-test-entity-options"
	                      options={entityIdOptions}
	                      maxOptions={500}
	                      value={deltaEntityId}
	                      onChange={(e) => setDeltaEntityId(e.target.value)}
	                      placeholder="binary_sensor.front_door"
	                      disabled={isLoading || isRunning}
	                    />
                    {deltaEntityId.trim() && entitiesById.get(deltaEntityId.trim())?.lastState != null && (
                      <div className="text-xs text-muted-foreground">
                        Baseline: {String(entitiesById.get(deltaEntityId.trim())?.lastState)}
                      </div>
                    )}
                  </div>
	                  <div className="md:col-span-4 space-y-1">
	                    <label className="text-xs text-muted-foreground">
	                      New state{' '}
	                      <HelpTip
	                        className="ml-1"
	                        content="The state to apply in the delta run (baseline + this change)."
	                      />
	                    </label>
                    <Input value={deltaState} onChange={(e) => setDeltaState(e.target.value)} disabled={isRunning} />
                    <div className="flex flex-wrap gap-1 pt-1">
                      {['on', 'off', 'open', 'closed', 'locked', 'unlocked'].map((v) => (
                        <button
                          key={v}
                          type="button"
                          className="rounded border border-input bg-background px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          disabled={isRunning}
                          onClick={() => setDeltaState(v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="button" onClick={simulateDelta} disabled={isRunning || !deltaEntityId.trim()}>
                    {isRunning ? 'Running…' : 'Run baseline + change'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRows((prev) => [...prev, { id: uniqueId(), entityId: '', state: 'on' }])}
              disabled={isRunning}
            >
              Add entity
            </Button>
            <Button type="button" variant="outline" onClick={() => setRows([{ id: uniqueId(), entityId: '', state: 'on' }])} disabled={isRunning}>
              Reset
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Assume conditions true for (seconds){' '}
                <HelpTip
                  className="ml-1"
                  content="Used only for FOR rules. If set to >= the rule's FOR seconds, the simulator will treat it as satisfied."
                />
              </label>
              <Input
                value={assumeForSeconds}
                onChange={(e) => setAssumeForSeconds(e.target.value)}
                placeholder="e.g., 300"
                disabled={isRunning}
              />
              <div className="flex flex-wrap gap-2 pt-2">
                {[0, 30, 60, 300].map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isRunning}
                    onClick={() => setAssumeForSeconds(String(v))}
                  >
                    {v}s
                  </Button>
                ))}
                <Button type="button" size="sm" variant="outline" disabled={isRunning} onClick={() => setAssumeForSeconds('')}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="flex items-end justify-end">
              {mode === 'scenario' ? (
                <Button type="button" onClick={simulate} disabled={isRunning}>
                  {isRunning ? 'Running…' : 'Run simulation'}
                </Button>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Use “Run baseline + change” above.
                </div>
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Saved scenarios</CardTitle>
              <CardDescription>Stored in your browser (localStorage).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1 md:col-span-2">
              <label className="text-xs text-muted-foreground">Scenario name</label>
                  <Input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="e.g., Door opened + motion" />
                </div>
                <div className="flex items-end gap-2">
                  <Button type="button" variant="outline" onClick={saveScenario} disabled={isRunning}>
                    Save
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs text-muted-foreground">
                    Load <HelpTip className="ml-1" content="Loads a saved scenario from your browser." />
                  </label>
                  <Select
                    size="sm"
                    value={selectedScenario}
                    onChange={(e) => {
                      setSelectedScenario(e.target.value)
                      if (e.target.value) loadScenario(e.target.value)
                    }}
                  >
                    <option value="">—</option>
                    {savedScenarios.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button type="button" variant="outline" onClick={deleteScenario} disabled={!selectedScenario || isRunning}>
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

	      <Card>
	        <CardHeader>
	          <CardTitle>Results</CardTitle>
	          <CardDescription>
	            {result?.summary
	              ? `Evaluated ${result.summary.evaluated}, matched ${result.summary.matched}, would schedule ${result.summary.wouldSchedule}.`
	              : 'Run a simulation to see results.'}
	          </CardDescription>
	        </CardHeader>
        <CardContent className="space-y-3">
          {!result ? (
            <EmptyState title="No results yet." description="Run a simulation to see which rules match." />
          ) : (
            <>
              {mode === 'delta' && diff && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Changes</CardTitle>
                    <CardDescription>
                      {diff.changedRules.length} rule(s) changed match status compared to baseline.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {diff.changedRules.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No rule match changes.</div>
                    ) : (
                      diff.changedRules.map(({ id, from, to }) => (
                        <details key={id} className="rounded-md border p-3">
                          <summary className="cursor-pointer">
                            <span className="font-medium">{to.name}</span>{' '}
                            <span className="text-xs text-muted-foreground">
                              ({to.kind}, priority {to.priority}) • {from.status} → {to.status}
                            </span>
                          </summary>
                          <div className="mt-2 grid gap-3 md:grid-cols-2">
                            <div>
                              <div className="text-xs font-medium text-muted-foreground">Baseline</div>
                              <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">
                                {JSON.stringify({ status: from.status, actions: from.actions, trace: from.trace }, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground">After change</div>
                              <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">
                                {JSON.stringify({ status: to.status, actions: to.actions, trace: to.trace }, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </details>
                      ))
                    )}
                  </CardContent>
                </Card>
              )}

	              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs text-muted-foreground">Filter rules</label>
                  <Input value={ruleSearch} onChange={(e) => setRuleSearch(e.target.value)} placeholder="Search by rule name…" />
                </div>
	                <div className="flex items-end gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={showOnlyMatched}
                      onCheckedChange={setShowOnlyMatched}
                      aria-labelledby="show-only-matched-label"
                    />
                    <span id="show-only-matched-label" className="text-sm">
                      Only matched{' '}
                      <HelpTip
                        className="ml-1"
                        content="Filters the lists down to rules that matched in the current result set."
                      />
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigator.clipboard?.writeText(JSON.stringify(result, null, 2))}
                  >
	                    <span>
	                      Copy JSON{' '}
	                      <HelpTip
	                        className="ml-1"
	                        content="Copies the full raw simulation response to your clipboard (useful for debugging)."
	                      />
	                    </span>
	                  </Button>
	                </div>
	              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Matched</CardTitle>
                  <CardDescription>{matchedRules.length} rule(s) matched.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {filterRuleList(matchedRules).length === 0 ? (
                    <div className="text-sm text-muted-foreground">None.</div>
                  ) : (
	                    filterRuleList(matchedRules).map((r) => (
                      <details key={r.id} className="rounded-md border p-3">
                        <summary className="cursor-pointer">
                          <span className="font-medium">{r.name}</span>{' '}
                          <span className="text-xs text-muted-foreground">
                            ({r.kind}, priority {r.priority})
                          </span>
                        </summary>
                        <div className="mt-2 grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="text-xs font-medium text-muted-foreground">Actions (preview)</div>
                            <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">
                              {JSON.stringify(r.actions ?? [], null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-muted-foreground">Explain</div>
                            <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">
                              {JSON.stringify(r.trace ?? {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </details>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">FOR rules (timers)</CardTitle>
                  <CardDescription>
                    {scheduledForRules.length} rule(s) would schedule a timer (not satisfied yet).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {filterRuleList(scheduledForRules).length === 0 ? (
                    <div className="text-sm text-muted-foreground">None.</div>
                  ) : (
	                    filterRuleList(scheduledForRules).map((r) => (
                      <details key={r.id} className="rounded-md border p-3">
                        <summary className="cursor-pointer">
                          <span className="font-medium">{r.name}</span>{' '}
                          <span className="text-xs text-muted-foreground">
                            ({r.kind}, priority {r.priority}) • would schedule {r.for?.seconds}s
                          </span>
                        </summary>
                        <div className="mt-2 grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="text-xs font-medium text-muted-foreground">Actions (preview)</div>
                            <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">
                              {JSON.stringify(r.actions ?? [], null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-muted-foreground">Explain</div>
                            <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">
                              {JSON.stringify(r.trace ?? {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </details>
                    ))
                  )}
                </CardContent>
              </Card>

              <details className="rounded-md border p-3">
                <summary className="cursor-pointer">
                  <span className="font-medium">Non-matching rules</span>{' '}
                  <span className="text-xs text-muted-foreground">
                    ({nonMatchingRules.length})
                  </span>
                </summary>
                <div className="mt-2 space-y-2">
	                  {filterRuleList(nonMatchingRules).map((r) => (
                    <details key={r.id} className="rounded-md border p-3">
                      <summary className="cursor-pointer">
                        <span className="font-medium">{r.name}</span>{' '}
                        <span className="text-xs text-muted-foreground">
                          ({r.kind}, priority {r.priority})
                        </span>
                      </summary>
                      <div className="mt-2 grid gap-3 md:grid-cols-2">
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">Actions (preview)</div>
                          <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">
                            {JSON.stringify(r.actions ?? [], null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-muted-foreground">Explain</div>
                          <pre className="mt-1 overflow-auto rounded-md bg-muted p-2 text-xs">
                            {JSON.stringify(r.trace ?? {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default RulesTestPage
