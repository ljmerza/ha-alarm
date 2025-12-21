import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { entitiesService, rulesService } from '@/services'
import type { Entity, Rule, RuleKind } from '@/types'
import { Link } from 'react-router-dom'
import { Routes } from '@/lib/constants'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'
import { HelpTip } from '@/components/ui/help-tip'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'

const ruleKinds: { value: RuleKind; label: string }[] = [
  { value: 'trigger', label: 'Trigger' },
  { value: 'disarm', label: 'Disarm' },
  { value: 'arm', label: 'Arm' },
  { value: 'suppress', label: 'Suppress' },
  { value: 'escalate', label: 'Escalate' },
]

type WhenOperator = 'all' | 'any'

type ConditionRow = {
  id: string
  entityId: string
  equals: string
  negate: boolean
}

type AlarmArmMode = 'armed_home' | 'armed_away' | 'armed_night' | 'armed_vacation'

type ActionRow =
  | { id: string; type: 'alarm_disarm' }
  | { id: string; type: 'alarm_trigger' }
  | { id: string; type: 'alarm_arm'; mode: AlarmArmMode }
  | {
      id: string
      type: 'ha_call_service'
      domain: string
      service: string
      targetEntityIds: string
      serviceDataJson: string
    }

function parseEntityIds(value: string): string[] {
  return value
    .split(/[\n,]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

function uniqueId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function countThenActions(definition: unknown): number {
  if (!isRecord(definition)) return 0
  const thenValue = definition.then
  return Array.isArray(thenValue) ? thenValue.length : 0
}

function buildDefinitionFromBuilder(
  whenOperator: WhenOperator,
  conditions: ConditionRow[],
  forSeconds: number | null,
  actions: ActionRow[]
): Record<string, unknown> {
  const conditionNodes: unknown[] = conditions
    .filter((c) => c.entityId.trim() && c.equals.trim())
    .map((c) => {
      const base = { op: 'entity_state', entity_id: c.entityId.trim(), equals: c.equals.trim() }
      if (c.negate) return { op: 'not', child: base }
      return base
    })

  const whenBase: Record<string, unknown> =
    conditionNodes.length === 0 ? {} : { op: whenOperator, children: conditionNodes }

  const when =
    forSeconds && forSeconds > 0 ? { op: 'for', seconds: forSeconds, child: whenBase } : whenBase

  const then: unknown[] = actions.map((a) => {
    if (a.type === 'alarm_disarm') return { type: 'alarm_disarm' }
    if (a.type === 'alarm_trigger') return { type: 'alarm_trigger' }
    if (a.type === 'alarm_arm') return { type: 'alarm_arm', mode: a.mode }
    return {
      type: 'ha_call_service',
      domain: a.domain.trim(),
      service: a.service.trim(),
      target: { entity_ids: parseEntityIds(a.targetEntityIds) },
      service_data: (() => {
        try {
          const parsed = JSON.parse(a.serviceDataJson || '{}')
          return parsed && typeof parsed === 'object' ? parsed : {}
        } catch {
          return {}
        }
      })(),
    }
  })

  return { when, then }
}

export function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<RuleKind>('trigger')
  const [enabled, setEnabled] = useState(true)
  const [priority, setPriority] = useState(0)
  const [cooldownSeconds, setCooldownSeconds] = useState<string>('')

  const [advanced, setAdvanced] = useState(false)
  const [definitionText, setDefinitionText] = useState('{\n  "when": {},\n  "then": []\n}')
  const [entityIdsText, setEntityIdsText] = useState('')

  const [whenOperator, setWhenOperator] = useState<WhenOperator>('all')
  const [forSecondsText, setForSecondsText] = useState<string>('')
  const [conditions, setConditions] = useState<ConditionRow[]>([
    { id: uniqueId(), entityId: '', equals: 'on', negate: false },
  ])
  const [actions, setActions] = useState<ActionRow[]>([{ id: uniqueId(), type: 'alarm_trigger' }])

  const entityIdOptions = useMemo(() => entities.map((e) => e.entityId), [entities])
  const entityIdSet = useMemo(() => new Set(entities.map((e) => e.entityId)), [entities])

  const derivedEntityIds = useMemo(() => {
    const fromConditions = conditions.map((c) => c.entityId.trim()).filter(Boolean)
    return Array.from(new Set(fromConditions)).sort()
  }, [conditions])

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setKind('trigger')
    setEnabled(true)
    setPriority(0)
    setCooldownSeconds('')

    setAdvanced(false)
    setWhenOperator('all')
    setForSecondsText('')
    setConditions([{ id: uniqueId(), entityId: '', equals: 'on', negate: false }])
    setActions([{ id: uniqueId(), type: 'alarm_trigger' }])
    setEntityIdsText('')
    setDefinitionText('{\n  "when": {},\n  "then": []\n}')
  }

  const load = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [rulesList, entitiesList] = await Promise.all([rulesService.list(), entitiesService.list()])
      setRules(rulesList)
      setEntities(entitiesList)
    } catch (err) {
      const anyErr = err as { message?: string }
      setError(anyErr.message || 'Failed to load rules')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const syncEntities = async () => {
    setNotice(null)
    setError(null)
    try {
      const result = await entitiesService.sync()
      setNotice(`Synced entities (imported ${result.imported}, updated ${result.updated}).`)
      const entitiesList = await entitiesService.list()
      setEntities(entitiesList)
    } catch (err) {
      const anyErr = err as { message?: string }
      setError(anyErr.message || 'Failed to sync entities')
    }
  }

  const runRulesNow = async () => {
    setNotice(null)
    setError(null)
    setIsSaving(true)
    try {
      const result = await rulesService.run()
      setNotice(
        `Rules run: evaluated ${result.evaluated}, fired ${result.fired}, scheduled ${result.scheduled}, cooldown ${result.skippedCooldown}, errors ${result.errors}.`
      )
      await load()
    } catch (err) {
      const anyErr = err as { message?: string }
      setError(anyErr.message || 'Failed to run rules')
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    if (advanced) return
    const parsedForSeconds =
      forSecondsText.trim() === '' ? null : Number.parseInt(forSecondsText.trim(), 10)
    const seconds =
      typeof parsedForSeconds === 'number' && Number.isNaN(parsedForSeconds) ? null : parsedForSeconds
    const def = buildDefinitionFromBuilder(whenOperator, conditions, seconds, actions)
    setDefinitionText(JSON.stringify(def, null, 2))
    setEntityIdsText(derivedEntityIds.join('\n'))
  }, [advanced, whenOperator, conditions, forSecondsText, actions, derivedEntityIds])

  const startEdit = (rule: Rule) => {
    setEditingId(rule.id)
    setName(rule.name)
    setKind(rule.kind)
    setEnabled(rule.enabled)
    setPriority(rule.priority)
    setCooldownSeconds(rule.cooldownSeconds == null ? '' : String(rule.cooldownSeconds))
    setNotice(null)
    setError(null)

    setDefinitionText(JSON.stringify(rule.definition ?? {}, null, 2))
    setEntityIdsText(rule.entityIds.join('\n'))

    try {
      const def = rule.definition as unknown
      if (!def || typeof def !== 'object' || Array.isArray(def)) return
      const asObj = def as Record<string, unknown>

      const nextConditions: ConditionRow[] = []
      const addEntityState = (node: unknown, negate = false) => {
        if (!isRecord(node)) return
        if (node.op === 'entity_state' && typeof node.entity_id === 'string') {
          nextConditions.push({
            id: uniqueId(),
            entityId: node.entity_id,
            equals: typeof node.equals === 'string' ? node.equals : 'on',
            negate,
          })
        }
      }

      let baseWhen: unknown = asObj.when
      if (isRecord(baseWhen) && baseWhen.op === 'for' && typeof baseWhen.seconds === 'number') {
        setForSecondsText(String(baseWhen.seconds))
        baseWhen = baseWhen.child
      } else {
        setForSecondsText('')
      }

      if (
        isRecord(baseWhen) &&
        (baseWhen.op === 'all' || baseWhen.op === 'any') &&
        Array.isArray(baseWhen.children)
      ) {
        setWhenOperator(baseWhen.op as WhenOperator)
        for (const child of baseWhen.children) {
          if (isRecord(child) && child.op === 'not') {
            addEntityState(child.child, true)
          } else {
            addEntityState(child, false)
          }
        }
      } else {
        setWhenOperator('all')
      }

      setConditions(
        nextConditions.length
          ? nextConditions
          : [{ id: uniqueId(), entityId: '', equals: 'on', negate: false }]
      )

      const nextActions: ActionRow[] = []
      if (Array.isArray(asObj.then)) {
        for (const action of asObj.then) {
          if (!isRecord(action)) continue
          const type = action.type
          if (type === 'alarm_disarm') nextActions.push({ id: uniqueId(), type: 'alarm_disarm' })
          if (type === 'alarm_trigger') nextActions.push({ id: uniqueId(), type: 'alarm_trigger' })
          if (type === 'alarm_arm' && typeof action.mode === 'string') {
            nextActions.push({ id: uniqueId(), type: 'alarm_arm', mode: action.mode as AlarmArmMode })
          }
          if (type === 'ha_call_service') {
            const target = isRecord(action.target) ? action.target : null
            const targetEntityIds = Array.isArray(target?.entity_ids)
              ? (target?.entity_ids as unknown[]).map(String).join(', ')
              : ''
            nextActions.push({
              id: uniqueId(),
              type: 'ha_call_service',
              domain: typeof action.domain === 'string' ? action.domain : '',
              service: typeof action.service === 'string' ? action.service : '',
              targetEntityIds,
              serviceDataJson: JSON.stringify(action.service_data ?? {}, null, 2),
            })
          }
        }
      }
      setActions(nextActions.length ? nextActions : [{ id: uniqueId(), type: 'alarm_trigger' }])
    } catch {
      // Keep builder defaults if parsing fails.
    }
  }

  const submit = async () => {
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const trimmedName = name.trim()
      if (!trimmedName) {
        setError('Rule name is required.')
        return
      }

      let parsedDefinition: Record<string, unknown>
      try {
        const parsed = JSON.parse(definitionText)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setError('Definition must be a JSON object.')
          return
        }
        parsedDefinition = parsed as Record<string, unknown>
      } catch {
        setError('Definition is not valid JSON.')
        return
      }

      const cooldown =
        cooldownSeconds.trim() === '' ? null : Number.parseInt(cooldownSeconds.trim(), 10)
      if (cooldownSeconds.trim() !== '' && Number.isNaN(cooldown)) {
        setError('Cooldown seconds must be a number.')
        return
      }

      const entityIds = parseEntityIds(entityIdsText)
      const payload = {
        name: trimmedName,
        kind,
        enabled,
        priority,
        schemaVersion: 1,
        definition: parsedDefinition,
        cooldownSeconds: cooldown,
        entityIds,
      }

      if (editingId == null) {
        await rulesService.create(payload)
        setNotice('Rule created.')
      } else {
        await rulesService.update(editingId, payload)
        setNotice('Rule updated.')
      }

      await load()
      resetForm()
    } catch (err) {
      const anyErr = err as { message?: string }
      setError(anyErr.message || 'Failed to save rule')
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async () => {
    if (editingId == null) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      await rulesService.delete(editingId)
      setNotice('Rule deleted.')
      await load()
      resetForm()
    } catch (err) {
      const anyErr = err as { message?: string }
      setError(anyErr.message || 'Failed to delete rule')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rules"
        description="Create trigger/disarm/arm rules (builder MVP)."
        actions={
          <>
            <Tooltip content="Imports/updates the local Entity Registry from Home Assistant, so entity IDs autocomplete and can be referenced in rules.">
              <Button type="button" variant="outline" onClick={syncEntities} disabled={isSaving}>
                Sync Entities
              </Button>
            </Tooltip>
            <Tooltip content="Runs enabled rules immediately using the server-side engine (useful for testing).">
              <Button type="button" variant="outline" onClick={runRulesNow} disabled={isSaving}>
                Run Rules
              </Button>
            </Tooltip>
            <Button asChild type="button" variant="outline">
              <Link to={Routes.RULES_TEST}>Test Rules</Link>
            </Button>
            <Button type="button" variant="outline" onClick={load} disabled={isSaving}>
              Refresh
            </Button>
          </>
        }
      />

      {notice && (
        <Alert variant="info" layout="banner">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="error" layout="banner">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{editingId == null ? 'New Rule' : `Edit Rule #${editingId}`}</CardTitle>
          <CardDescription>
            Builder supports simple entity-state conditions, optional “for”, and basic actions. JSON is always stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
	          <div className="grid gap-3 md:grid-cols-2">
	            <div className="space-y-1">
	              <label className="text-xs text-muted-foreground">
	                Name <HelpTip className="ml-1" content="A human-friendly label for the rule." />
	              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Disarm if presence for 5m"
              />
            </div>

            <div className="grid gap-3 grid-cols-2">
              <div className="space-y-1">
	                <label className="text-xs text-muted-foreground">
	                  Kind{' '}
	                  <HelpTip
	                    className="ml-1"
	                    content="What category the rule belongs to (trigger/disarm/arm/etc.). This is used for filtering and later conflict policy."
	                  />
	                </label>
	                <Select
	                  size="sm"
	                  value={kind}
	                  onChange={(e) => setKind(e.target.value as RuleKind)}
	                >
	                  {ruleKinds.map((k) => (
	                    <option key={k.value} value={k.value}>
	                      {k.label}
	                    </option>
	                  ))}
	                </Select>
	              </div>
	              <div className="space-y-1">
	                <label className="text-xs text-muted-foreground">
	                  Priority{' '}
	                  <HelpTip
	                    className="ml-1"
	                    content="Higher priority rules are evaluated first (and may win if multiple rules match)."
	                  />
	                </label>
                <Input
                  value={String(priority)}
                  onChange={(e) => setPriority(Number.parseInt(e.target.value || '0', 10) || 0)}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  aria-labelledby="rule-enabled-label"
                />
                <span id="rule-enabled-label" className="text-sm">
                  Enabled
                </span>
              </div>
              <HelpTip content="Disabled rules are saved but ignored by the engine." />
            </div>
            <Button type="button" variant="outline" onClick={() => setAdvanced((v) => !v)}>
              {advanced ? 'Use Builder' : 'Advanced JSON'}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
	              <label className="text-xs text-muted-foreground">
	                Cooldown seconds (optional){' '}
	                <HelpTip
	                  className="ml-1"
	                  content="Minimum time between fires for this rule (helps prevent spam/flapping)."
	                />
	              </label>
              <Input value={cooldownSeconds} onChange={(e) => setCooldownSeconds(e.target.value)} placeholder="e.g., 60" />
            </div>
            <div className="space-y-1">
	              <label className="text-xs text-muted-foreground">
	                Referenced entity IDs{' '}
	                <HelpTip
	                  className="ml-1"
	                  content="Used to quickly find which rules should re-evaluate when an entity changes. In Builder mode this is derived from your conditions; in Advanced mode you can edit it."
	                />
	              </label>
              <Textarea
                className="min-h-[88px]"
                value={entityIdsText}
                onChange={(e) => setEntityIdsText(e.target.value)}
                placeholder="One per line (or comma-separated)"
                disabled={!advanced}
              />
              <div className="text-xs text-muted-foreground">
                {!advanced
                  ? `Auto-derived from conditions: ${derivedEntityIds.length ? derivedEntityIds.join(', ') : '—'}`
                  : `Known entities: ${entities.length}.`}
              </div>
            </div>
          </div>

          {!advanced && (
            <Card>
	              <CardHeader>
	                <CardTitle className="text-base">
	                  When{' '}
	                  <HelpTip
	                    className="ml-1"
	                    content="The condition(s) that must match for the rule to fire."
	                  />
	              </CardTitle>
                <CardDescription>Match on entity state (equals) with AND/OR and optional “for”.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
	                  <div className="space-y-1">
	                    <label className="text-xs text-muted-foreground">
	                      Operator <HelpTip className="ml-1" content="All = AND. Any = OR." />
	                    </label>
	                    <Select
	                      size="sm"
	                      value={whenOperator}
	                      onChange={(e) => setWhenOperator(e.target.value as WhenOperator)}
	                    >
	                      <option value="all">All (AND)</option>
	                      <option value="any">Any (OR)</option>
	                    </Select>
	                  </div>
	                  <div className="space-y-1">
	                    <label className="text-xs text-muted-foreground">
	                      For seconds (optional){' '}
	                      <HelpTip
	                        className="ml-1"
	                        content="Requires the whole condition group to remain true continuously for this many seconds."
	                      />
	                    </label>
                    <Input value={forSecondsText} onChange={(e) => setForSecondsText(e.target.value)} placeholder="e.g., 300" />
                  </div>
                  <div className="text-xs text-muted-foreground flex items-end">
                    {conditions.length} condition{conditions.length === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="space-y-2">
                  <datalist id="entity-id-options">
                    {entityIdOptions.slice(0, 400).map((id) => (
                      <option key={id} value={id} />
                    ))}
                  </datalist>

                  {conditions.map((row) => (
                    <div key={row.id} className="grid gap-2 md:grid-cols-12 items-end">
	                      <div className="md:col-span-5 space-y-1">
	                        <label className="text-xs text-muted-foreground">
	                          Entity ID{' '}
	                          <HelpTip
	                            className="ml-1"
	                            content="A Home Assistant entity_id like binary_sensor.front_door. Use “Sync Entities” to get autocomplete."
	                          />
	                        </label>
                        <Input
                          list="entity-id-options"
                          value={row.entityId}
                          onChange={(e) => {
                            const value = e.target.value
                            setConditions((prev) =>
                              prev.map((c) => (c.id === row.id ? { ...c, entityId: value } : c))
                            )
                          }}
                          placeholder="binary_sensor.front_door"
                        />
                      </div>
	                      <div className="md:col-span-3 space-y-1">
	                        <label className="text-xs text-muted-foreground">
	                          Equals{' '}
	                          <HelpTip
	                            className="ml-1"
	                            content="The expected state string. Common examples: on/off, open/closed, locked/unlocked."
	                          />
	                        </label>
                        <Input
                          value={row.equals}
                          onChange={(e) => {
                            const value = e.target.value
                            setConditions((prev) =>
                              prev.map((c) => (c.id === row.id ? { ...c, equals: value } : c))
                            )
                          }}
                        />
                      </div>
                      <div className="md:col-span-2 flex items-center gap-2">
                        <Checkbox
                          id={`cond-negate-${row.id}`}
                          checked={row.negate}
                          onChange={(e) => {
                            const next = e.target.checked
                            setConditions((prev) =>
                              prev.map((c) => (c.id === row.id ? { ...c, negate: next } : c))
                            )
                          }}
                        />
	                        <label htmlFor={`cond-negate-${row.id}`} className="text-sm">
	                          NOT
	                        </label>
	                        <HelpTip content="Negates this condition (NOT entity_state)." />
	                      </div>
                      <div className="md:col-span-2 flex gap-2 justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={conditions.length <= 1}
                          onClick={() => setConditions((prev) => prev.filter((c) => c.id !== row.id))}
                        >
                          Remove
                        </Button>
                      </div>
                      {row.entityId.trim() && entities.length > 0 && !entityIdSet.has(row.entityId.trim()) && (
                        <div className="md:col-span-12 text-xs text-muted-foreground">
                          Unknown entity: {row.entityId.trim()} (sync entities or check spelling)
                        </div>
                      )}
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setConditions((prev) => [
                        ...prev,
                        { id: uniqueId(), entityId: '', equals: 'on', negate: false },
                      ])
                    }
                  >
                    Add condition
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!advanced && (
            <Card>
	              <CardHeader>
	                <CardTitle className="text-base">
	                  Then{' '}
	                  <HelpTip
	                    className="ml-1"
	                    content="The action(s) to execute when the rule matches. Multiple actions run in order."
	                  />
	              </CardTitle>
                <CardDescription>Actions to run when the condition matches.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {actions.map((a) => (
                    <div key={a.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">Action</div>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={actions.length <= 1}
                          onClick={() => setActions((prev) => prev.filter((x) => x.id !== a.id))}
                        >
                          Remove
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1">
	                          <label className="text-xs text-muted-foreground">
	                            Type{' '}
	                            <HelpTip
	                              className="ml-1"
	                              content="Alarm actions change alarm state. call_service triggers a Home Assistant service call."
	                            />
	                          </label>
	                          <Select
	                            size="sm"
	                            value={a.type}
	                            onChange={(e) => {
	                              const type = e.target.value as ActionRow['type']
	                              setActions((prev) =>
	                                prev.map((row) => {
                                  if (row.id !== a.id) return row
                                  if (type === 'alarm_disarm') return { id: row.id, type }
                                  if (type === 'alarm_trigger') return { id: row.id, type }
                                  if (type === 'alarm_arm') return { id: row.id, type, mode: 'armed_away' }
                                  return {
                                    id: row.id,
                                    type,
                                    domain: 'notify',
                                    service: '',
                                    targetEntityIds: '',
                                    serviceDataJson: '{\n  "message": "Rule fired"\n}',
                                  }
	                                })
	                              )
	                            }}
	                          >
	                            <option value="alarm_trigger">Alarm trigger</option>
	                            <option value="alarm_disarm">Alarm disarm</option>
	                            <option value="alarm_arm">Alarm arm</option>
	                            <option value="ha_call_service">Home Assistant call_service</option>
	                          </Select>
	                        </div>

                        {a.type === 'alarm_arm' && (
	                          <div className="space-y-1">
	                            <label className="text-xs text-muted-foreground">
	                              Mode{' '}
	                              <HelpTip
	                                className="ml-1"
	                                content="Which armed mode to switch the alarm into."
	                              />
	                            </label>
	                            <Select
	                              size="sm"
	                              value={a.mode}
	                              onChange={(e) => {
	                                const mode = e.target.value as AlarmArmMode
	                                setActions((prev) =>
	                                  prev.map((row) => (row.id === a.id ? { ...row, mode } : row)) as ActionRow[]
                                )
                              }}
                            >
	                              <option value="armed_away">Armed away</option>
	                              <option value="armed_home">Armed home</option>
	                              <option value="armed_night">Armed night</option>
	                              <option value="armed_vacation">Armed vacation</option>
	                            </Select>
	                          </div>
	                        )}

                        {a.type === 'ha_call_service' && (
                          <>
	                            <div className="space-y-1">
	                              <label className="text-xs text-muted-foreground">
	                                Domain{' '}
	                                <HelpTip
	                                  className="ml-1"
	                                  content="Service domain, e.g. notify, light, switch, siren."
	                                />
	                              </label>
                              <Input
                                value={a.domain}
                                onChange={(e) =>
                                  setActions((prev) =>
                                    prev.map((row) =>
                                      row.id === a.id ? { ...row, domain: e.target.value } : row
                                    ) as ActionRow[]
                                  )
                                }
                                placeholder="e.g., notify"
                              />
                            </div>
                            <div className="space-y-1">
	                              <label className="text-xs text-muted-foreground">
	                                Service{' '}
	                                <HelpTip
	                                  className="ml-1"
	                                  content="Service name within the domain, e.g. turn_on, turn_off, mobile_app_foo."
	                                />
	                              </label>
                              <Input
                                value={a.service}
                                onChange={(e) =>
                                  setActions((prev) =>
                                    prev.map((row) =>
                                      row.id === a.id ? { ...row, service: e.target.value } : row
                                    ) as ActionRow[]
                                  )
                                }
                                placeholder="e.g., mobile_app_phone"
                              />
                            </div>
                            <div className="md:col-span-3 space-y-1">
	                              <label className="text-xs text-muted-foreground">
	                                Target entity IDs{' '}
	                                <HelpTip
	                                  className="ml-1"
	                                  content="Comma-separated entity_ids to target (maps to target.entity_ids)."
	                                />
	                              </label>
                              <Input
                                value={a.targetEntityIds}
                                onChange={(e) =>
                                  setActions((prev) =>
                                    prev.map((row) =>
                                      row.id === a.id ? { ...row, targetEntityIds: e.target.value } : row
                                    ) as ActionRow[]
                                  )
                                }
                                placeholder="notify.phone, light.kitchen"
                              />
                            </div>
                            <div className="md:col-span-3 space-y-1">
	                              <label className="text-xs text-muted-foreground">
	                                Service data (JSON){' '}
	                                <HelpTip
	                                  className="ml-1"
	                                  content='JSON object passed as service_data. Example for notify: {"message":"..."}.'
	                                />
	                              </label>
                              <Textarea
                                className="min-h-[120px] font-mono text-xs"
                                value={a.serviceDataJson}
                                onChange={(e) =>
                                  setActions((prev) =>
                                    prev.map((row) =>
                                      row.id === a.id ? { ...row, serviceDataJson: e.target.value } : row
                                    ) as ActionRow[]
                                  )
                                }
                                spellCheck={false}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActions((prev) => [...prev, { id: uniqueId(), type: 'alarm_trigger' }])}
                >
                  Add action
                </Button>
              </CardContent>
            </Card>
          )}

	          <div className="space-y-1">
	            <label className="text-xs text-muted-foreground">
	              Definition (JSON){' '}
	              <HelpTip
	                className="ml-1"
	                content="The stored rule definition. Builder mode keeps this read-only; Advanced mode lets you edit it directly."
	              />
	            </label>
            <Textarea
              className="min-h-[220px] font-mono text-xs"
              value={definitionText}
              onChange={(e) => setDefinitionText(e.target.value)}
              spellCheck={false}
              disabled={!advanced}
            />
            {!advanced && <div className="text-xs text-muted-foreground">JSON preview is read-only in Builder mode.</div>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={submit} disabled={isSaving}>
              {editingId == null ? 'Create' : 'Save'}
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={isSaving}>
              Cancel
            </Button>
            {editingId != null && (
              <Button type="button" variant="destructive" onClick={remove} disabled={isSaving}>
                Delete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Rules</CardTitle>
          <CardDescription>{isLoading ? 'Loading…' : `${rules.length} rule(s)`}</CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-sm text-muted-foreground">No rules yet.</div>
          ) : (
            <div className="space-y-2">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium">
                      {r.name}{' '}
                      <span className="text-xs text-muted-foreground">({r.kind}, priority {r.priority})</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className={r.enabled ? 'text-emerald-700' : 'text-muted-foreground'}>
                        {r.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <span>•</span>
                      <span>Schema v{r.schemaVersion}</span>
                      <span>•</span>
                      <span>
                        Cooldown:{' '}
                        {r.cooldownSeconds == null ? '—' : `${r.cooldownSeconds}s`}
                      </span>
                      <span>•</span>
                      <span>
	                        Actions: {countThenActions(r.definition)}
	                      </span>
                    </div>

                    <div className="mt-2">
                      <div className="text-xs text-muted-foreground">Entities</div>
                      {r.entityIds.length === 0 ? (
                        <div className="text-xs text-muted-foreground">—</div>
                      ) : (
                        <ul className="mt-1 flex flex-wrap gap-1">
                          {r.entityIds.map((id) => (
                            <li
                              key={id}
                              className="rounded-full border border-input bg-background px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              {id}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={() => startEdit(r)}>
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default RulesPage
