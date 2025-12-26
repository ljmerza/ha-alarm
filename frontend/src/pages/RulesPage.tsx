import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import type { Entity, Rule, RuleKind } from '@/types'
import { queryKeys } from '@/types'
import { Link } from 'react-router-dom'
import { Routes } from '@/lib/constants'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Page } from '@/components/layout'
import { HelpTip } from '@/components/ui/help-tip'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Pill } from '@/components/ui/pill'
import { DatalistInput } from '@/components/ui/datalist-input'
import { FormField } from '@/components/ui/form-field'
import { EmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { useEntitiesQuery, useRulesQuery, useSyncEntitiesMutation, useRunRulesMutation, useSaveRuleMutation, useDeleteRuleMutation } from '@/hooks/useRulesQueries'
import { X } from 'lucide-react'
import { getErrorMessage } from '@/types/errors'
import { isRecord, isWhenOperator, isAlarmArmMode, type WhenOperator, type AlarmArmMode } from '@/lib/typeGuards'
import { parseRuleDefinition, type RuleDefinition } from '@/types/ruleDefinition'
import { getSelectValue } from '@/lib/formHelpers'

const ruleKinds: { value: RuleKind; label: string }[] = [
  { value: 'trigger', label: 'Trigger' },
  { value: 'disarm', label: 'Disarm' },
  { value: 'arm', label: 'Arm' },
  { value: 'suppress', label: 'Suppress' },
  { value: 'escalate', label: 'Escalate' },
]

type ConditionRow = {
  id: string
  entityId: string
  equals: string
  negate: boolean
}

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
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const rulesQuery = useRulesQuery()
  const entitiesQuery = useEntitiesQuery()

  const rules: Rule[] = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data])
  const entities: Entity[] = useMemo(() => entitiesQuery.data ?? [], [entitiesQuery.data])
  const isLoading = rulesQuery.isLoading || entitiesQuery.isLoading

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
  const [targetEntityPickerByActionId, setTargetEntityPickerByActionId] = useState<Record<string, string>>({})

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

  const syncEntitiesMutation = useSyncEntitiesMutation()
  const runRulesMutation = useRunRulesMutation()
  const saveRuleMutation = useSaveRuleMutation()
  const deleteRuleMutation = useDeleteRuleMutation()

  const isSaving =
    syncEntitiesMutation.isPending ||
    runRulesMutation.isPending ||
    saveRuleMutation.isPending ||
    deleteRuleMutation.isPending

  const syncEntities = async () => {
    setNotice(null)
    setError(null)
    try {
      const result = await syncEntitiesMutation.mutateAsync()
      setNotice(result.notice)
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to sync entities')
    }
  }

  const runRulesNow = async () => {
    setNotice(null)
    setError(null)
    try {
      const result = await runRulesMutation.mutateAsync()
      setNotice(result.notice)
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to run rules')
    }
  }

  const builderSeconds = useMemo(() => {
    const parsed = forSecondsText.trim() === '' ? null : Number.parseInt(forSecondsText.trim(), 10)
    if (typeof parsed === 'number' && Number.isNaN(parsed)) return null
    return parsed
  }, [forSecondsText])

  const builderDefinitionText = useMemo(() => {
    const def = buildDefinitionFromBuilder(whenOperator, conditions, builderSeconds, actions)
    return JSON.stringify(def, null, 2)
  }, [whenOperator, conditions, builderSeconds, actions])

  const derivedEntityIdsText = useMemo(() => derivedEntityIds.join('\n'), [derivedEntityIds])

  const updateHaActionTargetEntityIds = (actionId: string, nextEntityIds: string[]) => {
    const normalized = Array.from(new Set(nextEntityIds.map((id) => id.trim()).filter(Boolean)))
    setActions((prev) =>
      prev.map((row) => {
        if (row.id !== actionId) return row
        if (row.type !== 'ha_call_service') return row
        return { ...row, targetEntityIds: normalized.join(', ') }
      }) as ActionRow[]
    )
  }

  const displayedError =
    error ||
    getErrorMessage(rulesQuery.error) ||
    getErrorMessage(entitiesQuery.error) ||
    null

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
      // Use parseRuleDefinition for validation
      const parsedDef = parseRuleDefinition(rule.definition)
      if (!parsedDef) return

      const asObj = parsedDef

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
        isWhenOperator(baseWhen.op) &&
        Array.isArray(baseWhen.children)
      ) {
        setWhenOperator(baseWhen.op)
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
          if (type === 'alarm_arm' && typeof action.mode === 'string' && isAlarmArmMode(action.mode)) {
            nextActions.push({ id: uniqueId(), type: 'alarm_arm', mode: action.mode })
          }
          if (type === 'ha_call_service') {
            const target = isRecord(action.target) ? action.target : null
            const targetEntityIds = Array.isArray(target?.entity_ids)
              ? target.entity_ids.map(String).join(', ')
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
    setError(null)
    setNotice(null)
    try {
      const trimmedName = name.trim()
      if (!trimmedName) {
        setError('Rule name is required.')
        return
      }

      let parsedDefinition: RuleDefinition
      try {
        const parsed = JSON.parse(definitionText)
        const validated = parseRuleDefinition(parsed)
        if (!validated) {
          setError('Definition must be a valid rule structure with "when" and "then" properties.')
          return
        }
        parsedDefinition = validated
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

      const result = await saveRuleMutation.mutateAsync({ id: editingId, payload })
      setNotice(result.notice)
      resetForm()
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to save rule')
    }
  }

  const remove = async () => {
    if (editingId == null) return
    setError(null)
    setNotice(null)
    try {
      const result = await deleteRuleMutation.mutateAsync(editingId)
      setNotice(result.notice)
      resetForm()
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to delete rule')
    }
  }

  return (
    <Page
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
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: queryKeys.rules.all })
              void queryClient.invalidateQueries({ queryKey: queryKeys.entities.all })
            }}
            disabled={isSaving}
          >
            Refresh
          </Button>
        </>
      }
    >

      {notice && (
        <Alert variant="info" layout="banner">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {displayedError && (
        <Alert variant="error" layout="banner">
          <AlertDescription>{displayedError}</AlertDescription>
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
            <FormField
              size="compact"
              label="Name"
              htmlFor="rule-name"
              help="A human-friendly label for the rule."
            >
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Disarm if presence for 5m"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                size="compact"
                label="Kind"
                htmlFor="rule-kind"
                help="What category the rule belongs to (trigger/disarm/arm/etc.). This is used for filtering and later conflict policy."
              >
                <Select
                  id="rule-kind"
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
              </FormField>

              <FormField
                size="compact"
                label="Priority"
                htmlFor="rule-priority"
                help="Higher priority rules are evaluated first (and may win if multiple rules match)."
              >
                <Input
                  id="rule-priority"
                  value={String(priority)}
                  onChange={(e) => setPriority(Number.parseInt(e.target.value || '0', 10) || 0)}
                />
              </FormField>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAdvanced((v) => {
                  const next = !v
                  if (next) {
                    setDefinitionText(builderDefinitionText)
                    setEntityIdsText(derivedEntityIdsText)
                  }
                  return next
                })
              }}
            >
              {advanced ? 'Use Builder' : 'Advanced JSON'}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <FormField
              size="compact"
              label="Cooldown seconds (optional)"
              htmlFor="rule-cooldown-seconds"
              help="Minimum time between fires for this rule (helps prevent spam/flapping)."
            >
              <Input
                id="rule-cooldown-seconds"
                value={cooldownSeconds}
                onChange={(e) => setCooldownSeconds(e.target.value)}
                placeholder="e.g., 60"
              />
            </FormField>

            <FormField
              size="compact"
              label="Referenced entity IDs"
              htmlFor="rule-entity-ids"
              help="Used to quickly find which rules should re-evaluate when an entity changes. In Builder mode this is derived from your conditions; in Advanced mode you can edit it."
              description={
                !advanced
                  ? `Auto-derived from conditions: ${derivedEntityIds.length ? derivedEntityIds.join(', ') : '—'}`
                  : `Known entities: ${entities.length}.`
              }
            >
              <Textarea
                id="rule-entity-ids"
                className="min-h-[88px]"
                value={advanced ? entityIdsText : derivedEntityIdsText}
                onChange={(e) => setEntityIdsText(e.target.value)}
                placeholder="One per line (or comma-separated)"
                disabled={!advanced}
              />
            </FormField>
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
	                      onChange={(e) => setWhenOperator(getSelectValue(e, isWhenOperator, 'all'))}
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
	                        <DatalistInput
	                          listId="entity-id-options"
	                          options={entityIdOptions}
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
	                                const mode = getSelectValue(e, isAlarmArmMode, 'armed_away')
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
	                                  content="Select one or more entity_ids to target (maps to target.entity_ids)."
	                                />
	                              </label>
                              {(() => {
                                const selected = parseEntityIds(a.targetEntityIds)
                                const pickerValue = targetEntityPickerByActionId[a.id] ?? ''

                                const addSelected = () => {
                                  const next = pickerValue.trim()
                                  if (!next) return
                                  updateHaActionTargetEntityIds(a.id, [...selected, next])
                                  setTargetEntityPickerByActionId((prev) => ({ ...prev, [a.id]: '' }))
                                }

                                const removeSelected = (entityId: string) => {
                                  updateHaActionTargetEntityIds(
                                    a.id,
                                    selected.filter((id) => id !== entityId)
                                  )
                                }

                                return (
                                  <div className="space-y-2">
                                    <div className="flex flex-col gap-2 md:flex-row">
                                      <div className="flex-1">
                                        <DatalistInput
                                          listId={`ha-target-entities-${a.id}`}
                                          options={entityIdOptions}
                                          value={pickerValue}
                                          onChange={(e) => {
                                            const next = e.target.value
                                            setTargetEntityPickerByActionId((prev) => ({
                                              ...prev,
                                              [a.id]: next,
                                            }))
                                            if (entityIdSet.has(next) && !selected.includes(next)) {
                                              updateHaActionTargetEntityIds(a.id, [...selected, next])
                                              setTargetEntityPickerByActionId((prev) => ({ ...prev, [a.id]: '' }))
                                            }
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key !== 'Enter') return
                                            e.preventDefault()
                                            addSelected()
                                          }}
                                          placeholder="Start typing an entity_id (e.g., light.kitchen)…"
                                        />
                                      </div>
                                      <Button type="button" variant="outline" onClick={addSelected}>
                                        Add
                                      </Button>
                                    </div>

                                    {selected.length ? (
                                      <div className="flex flex-wrap gap-2">
                                        {selected.map((entityId) => {
                                          const isKnown = entityIdSet.has(entityId)
                                          return (
                                            <Pill
                                              key={entityId}
                                              variant={isKnown ? 'default' : 'muted'}
                                              className="gap-1 pr-1"
                                            >
                                              <span>{entityId}</span>
                                              <IconButton
                                                type="button"
                                                variant="ghost"
                                                className="h-5 w-5"
                                                onClick={() => removeSelected(entityId)}
                                                aria-label={`Remove target ${entityId}`}
                                              >
                                                <X className="h-3 w-3" />
                                              </IconButton>
                                            </Pill>
                                          )
                                        })}
                                      </div>
                                    ) : (
                                      <div className="text-xs text-muted-foreground">No targets selected.</div>
                                    )}

                                    <Input
                                      value={a.targetEntityIds}
                                      onChange={(e) =>
                                        setActions((prev) =>
                                          prev.map((row) =>
                                            row.id === a.id ? { ...row, targetEntityIds: e.target.value } : row
                                          ) as ActionRow[]
                                        )
                                      }
                                      placeholder="Or paste comma/newline-separated entity_ids…"
                                    />
                                  </div>
                                )
                              })()}
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
              value={advanced ? definitionText : builderDefinitionText}
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
	            <EmptyState title="No rules yet." description="Create a rule above to get started." />
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
	                            <li key={id}>
	                              <Pill>{id}</Pill>
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
    </Page>
  )
}

export default RulesPage
