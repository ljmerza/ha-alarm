import { useEffect, useMemo, useState } from 'react'
import { Page } from '@/components/layout'
import { SectionCard } from '@/components/ui/section-card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingInline } from '@/components/ui/loading-inline'
import { DatalistInput } from '@/components/ui/datalist-input'
import { HelpTip } from '@/components/ui/help-tip'
import { IconButton } from '@/components/ui/icon-button'
import { Pill } from '@/components/ui/pill'
import { getErrorMessage } from '@/types/errors'
import { isRecord } from '@/lib/typeGuards'
import { AlarmState, AlarmStateLabels, Routes, type AlarmStateType, UserRole } from '@/lib/constants'
import type { AlarmSettingsProfile } from '@/types'
import { useAlarmSettingsQuery } from '@/hooks/useAlarmQueries'
import { useCurrentUserQuery } from '@/hooks/useAuthQueries'
import { useHomeAssistantNotifyServices } from '@/hooks/useHomeAssistant'
import { useUpdateSettingsProfileMutation } from '@/hooks/useSettingsQueries'
import { useMqttAlarmEntityQuery, useMqttSettingsQuery, useMqttStatusQuery } from '@/hooks/useMqtt'
import { useZwavejsSettingsQuery, useZwavejsStatusQuery } from '@/hooks/useZwavejs'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'

type SettingsDraft = {
  delayTime: string
  armingTime: string
  armingTimeHome: string
  armingTimeAway: string
  armingTimeNight: string
  armingTimeVacation: string
  triggerTime: string
  disarmAfterTrigger: boolean
  codeArmRequired: boolean
  availableArmingStates: AlarmStateType[]
  homeAssistantNotifyEnabled: boolean
  homeAssistantNotifyServices: string[]
  homeAssistantNotifyCooldownSeconds: string
  homeAssistantNotifyStates: AlarmStateType[]
}

const ARM_MODE_OPTIONS: AlarmStateType[] = [
  AlarmState.ARMED_AWAY,
  AlarmState.ARMED_HOME,
  AlarmState.ARMED_NIGHT,
  AlarmState.ARMED_VACATION,
  AlarmState.ARMED_CUSTOM_BYPASS,
]

const HA_NOTIFY_STATE_OPTIONS: AlarmStateType[] = [
  AlarmState.ARMING,
  AlarmState.ARMED_AWAY,
  AlarmState.ARMED_HOME,
  AlarmState.ARMED_NIGHT,
  AlarmState.ARMED_VACATION,
  AlarmState.PENDING,
  AlarmState.TRIGGERED,
  AlarmState.DISARMED,
]

const ARM_MODE_TOOLTIPS: Record<AlarmStateType, string> = {
  [AlarmState.ARMED_HOME]: 'Typically perimeter-only protection while you are home.',
  [AlarmState.ARMED_AWAY]: 'Typically full protection when the home is empty.',
  [AlarmState.ARMED_NIGHT]: 'Typically like Home, but optimized for sleeping hours.',
  [AlarmState.ARMED_VACATION]: 'Typically like Away, plus extra deterrence/automations.',
  [AlarmState.ARMED_CUSTOM_BYPASS]: 'Custom/bypass mode (if supported by your setup).',
  [AlarmState.DISARMED]: 'All sensors inactive; no alarm triggers.',
  [AlarmState.ARMING]: 'Exit delay countdown before an armed mode becomes active.',
  [AlarmState.PENDING]: 'Entry delay countdown after an entry sensor trips.',
  [AlarmState.TRIGGERED]: 'Alarm is active/triggered.',
}

export function SettingsPage() {
  const navigate = useNavigate()
  const currentUserQuery = useCurrentUserQuery()
  const isAdmin = currentUserQuery.data?.role === UserRole.ADMIN

  const settingsQuery = useAlarmSettingsQuery()
  const haNotifyServicesQuery = useHomeAssistantNotifyServices()
  const updateMutation = useUpdateSettingsProfileMutation()
  const mqttStatusQuery = useMqttStatusQuery()
  const mqttSettingsQuery = useMqttSettingsQuery()
  const mqttEntityQuery = useMqttAlarmEntityQuery()
  const zwavejsStatusQuery = useZwavejsStatusQuery()
  const zwavejsSettingsQuery = useZwavejsSettingsQuery()

  const settings = settingsQuery.data ?? null
  const isLoading = settingsQuery.isLoading || updateMutation.isPending

  const initialDraft = useMemo(() => {
    if (!settings) return null
    return draftFromSettings(settings)
  }, [settings])

  const [draft, setDraft] = useState<SettingsDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [haNotifyServicePicker, setHaNotifyServicePicker] = useState('')

  useEffect(() => {
    if (!initialDraft) return
    queueMicrotask(() => setDraft((prev) => prev ?? initialDraft))
  }, [initialDraft])

  const reset = () => {
    if (!initialDraft) return
    setDraft(initialDraft)
    setError(null)
    setNotice(null)
  }

  const save = async () => {
    setError(null)
    setNotice(null)
    if (!isAdmin) return
    if (!settings || !draft) return

    const parsed = parseDraft(draft)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }

    try {
      const existingOverrides = normalizeStateOverrides(settings.stateOverrides ?? {})
      const nextStateOverrides = {
        ...existingOverrides,
        [AlarmState.ARMED_HOME]: {
          ...(existingOverrides[AlarmState.ARMED_HOME] ?? {}),
          armingTime: parsed.value.armingTimeHome,
        },
        [AlarmState.ARMED_AWAY]: {
          ...(existingOverrides[AlarmState.ARMED_AWAY] ?? {}),
          armingTime: parsed.value.armingTimeAway,
        },
        [AlarmState.ARMED_NIGHT]: {
          ...(existingOverrides[AlarmState.ARMED_NIGHT] ?? {}),
          armingTime: parsed.value.armingTimeNight,
        },
        [AlarmState.ARMED_VACATION]: {
          ...(existingOverrides[AlarmState.ARMED_VACATION] ?? {}),
          armingTime: parsed.value.armingTimeVacation,
        },
      }

      await updateMutation.mutateAsync({
        id: settings.id,
        changes: {
          entries: [
            { key: 'delay_time', value: parsed.value.delayTime },
            { key: 'arming_time', value: parsed.value.armingTime },
            { key: 'trigger_time', value: parsed.value.triggerTime },
            { key: 'disarm_after_trigger', value: parsed.value.disarmAfterTrigger },
            { key: 'code_arm_required', value: parsed.value.codeArmRequired },
            { key: 'available_arming_states', value: parsed.value.availableArmingStates },
            { key: 'state_overrides', value: nextStateOverrides },
            { key: 'home_assistant_notify', value: parsed.value.homeAssistantNotify },
          ],
        },
      })
      setNotice('Saved.')
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to save settings')
    }
  }

  const loadError = getErrorMessage(settingsQuery.error) || null

  return (
    <Page title="Settings">

      {!isAdmin ? (
        <Alert>
          <AlertDescription>Admin role required to change settings.</AlertDescription>
        </Alert>
      ) : null}

      {loadError ? (
        <Alert variant="error">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : notice ? (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {settingsQuery.isLoading ? (
        <div className="py-6">
          <LoadingInline label="Loading settings…" />
        </div>
      ) : !draft ? null : (
        <div className="space-y-6">
          <SectionCard
            title="Timing"
            description="Simple alarm timings (seconds)."
            actions={
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => settingsQuery.refetch()} disabled={isLoading}>
                  Refresh
                </Button>
                <Button type="button" variant="secondary" onClick={reset} disabled={isLoading || !initialDraft}>
                  Reset
                </Button>
                <Button type="button" onClick={save} disabled={isLoading || !isAdmin}>
                  Save
                </Button>
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                label="Entry delay"
                htmlFor="delayTime"
                help="How long you have to disarm after an entry-point sensor trips (e.g., front door) before the alarm triggers."
              >
                <Input
                  id="delayTime"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draft.delayTime}
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, delayTime: e.target.value } : prev))}
                  disabled={!isAdmin || isLoading}
                />
              </FormField>

              <FormField
                label="Exit delay (default)"
                htmlFor="armingTime"
                help="Fallback countdown after you arm before the alarm is active. Per-mode exit delays below override this."
              >
                <Input
                  id="armingTime"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draft.armingTime}
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, armingTime: e.target.value } : prev))}
                  disabled={!isAdmin || isLoading}
                />
              </FormField>

              <FormField
                label="Trigger time"
                htmlFor="triggerTime"
                help="How long the alarm remains in the Triggered state before it returns to the previous armed state (or disarms, if configured)."
              >
                <Input
                  id="triggerTime"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draft.triggerTime}
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, triggerTime: e.target.value } : prev))}
                  disabled={!isAdmin || isLoading}
                />
              </FormField>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <FormField
                label={`Exit delay: ${AlarmStateLabels[AlarmState.ARMED_HOME]}`}
                htmlFor="armingTimeHome"
                help="Countdown after arming Home before it becomes active. Set to 0 to arm immediately."
              >
                <Input
                  id="armingTimeHome"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draft.armingTimeHome}
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, armingTimeHome: e.target.value } : prev))}
                  disabled={!isAdmin || isLoading}
                />
              </FormField>

              <FormField
                label={`Exit delay: ${AlarmStateLabels[AlarmState.ARMED_AWAY]}`}
                htmlFor="armingTimeAway"
                help="Countdown after arming Away before it becomes active."
              >
                <Input
                  id="armingTimeAway"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draft.armingTimeAway}
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, armingTimeAway: e.target.value } : prev))}
                  disabled={!isAdmin || isLoading}
                />
              </FormField>

              <FormField
                label={`Exit delay: ${AlarmStateLabels[AlarmState.ARMED_NIGHT]}`}
                htmlFor="armingTimeNight"
                help="Countdown after arming Night before it becomes active."
              >
                <Input
                  id="armingTimeNight"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draft.armingTimeNight}
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, armingTimeNight: e.target.value } : prev))}
                  disabled={!isAdmin || isLoading}
                />
              </FormField>

              <FormField
                label={`Exit delay: ${AlarmStateLabels[AlarmState.ARMED_VACATION]}`}
                htmlFor="armingTimeVacation"
                help="Countdown after arming Vacation before it becomes active."
              >
                <Input
                  id="armingTimeVacation"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draft.armingTimeVacation}
                  onChange={(e) =>
                    setDraft((prev) => (prev ? { ...prev, armingTimeVacation: e.target.value } : prev))
                  }
                  disabled={!isAdmin || isLoading}
                />
              </FormField>
            </div>
          </SectionCard>

          <SectionCard title="Behavior" description="Basic behavior toggles.">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Disarm after trigger"
                help="If enabled, auto-disarm after Trigger time; otherwise return to the previous armed state."
              >
                <Switch
                  checked={draft.disarmAfterTrigger}
                  onCheckedChange={(checked) => setDraft((prev) => (prev ? { ...prev, disarmAfterTrigger: checked } : prev))}
                  disabled={!isAdmin || isLoading}
                />
              </FormField>

              <FormField
                label="Code required to arm"
                help="If disabled, arming does not require a PIN (disarm still requires a code)."
              >
                <Switch
                  checked={draft.codeArmRequired}
                  onCheckedChange={(checked) => setDraft((prev) => (prev ? { ...prev, codeArmRequired: checked } : prev))}
                  disabled={!isAdmin || isLoading}
                />
              </FormField>
            </div>
          </SectionCard>

          <SectionCard title="Arm modes" description="Choose which arming modes are available in the UI.">
            <div className="grid gap-3 md:grid-cols-2">
              {ARM_MODE_OPTIONS.map((state) => {
                const checked = draft.availableArmingStates.includes(state)
                return (
                  <label key={state} className="flex items-center gap-3 rounded-md border border-input px-3 py-2">
                    <Checkbox
                      checked={checked}
                      onChange={() =>
                        setDraft((prev) =>
                          prev ? { ...prev, availableArmingStates: toggleState(prev.availableArmingStates, state) } : prev
                        )
                      }
                      disabled={!isAdmin || isLoading}
                    />
                    <div className="flex items-center gap-2">
                      <div className="text-sm">{AlarmStateLabels[state]}</div>
                      <HelpTip content={ARM_MODE_TOOLTIPS[state] || 'Arming mode.'} />
                    </div>
                  </label>
                )
              })}
            </div>
          </SectionCard>

          <SectionCard
            title="Home Assistant notifications"
            description="Send Home Assistant notify.* messages on selected alarm state changes."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Enable"
                help="When enabled, the backend will call a Home Assistant notify.* service for the state changes you select below."
              >
                <Switch
                  checked={draft.homeAssistantNotifyEnabled}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => (prev ? { ...prev, homeAssistantNotifyEnabled: checked } : prev))
                  }
                  disabled={!isAdmin || isLoading}
                />
              </FormField>

              <FormField
                label="Cooldown (seconds)"
                htmlFor="haNotifyCooldown"
                help="Minimum time between repeated notifications for the same state (helps avoid spam during flapping/reconnects)."
              >
                <Input
                  id="haNotifyCooldown"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draft.homeAssistantNotifyCooldownSeconds}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, homeAssistantNotifyCooldownSeconds: e.target.value } : prev
                    )
                  }
                  disabled={!isAdmin || isLoading}
                />
              </FormField>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FormField
                label="Notify services"
                help="One or more Home Assistant notify services (notify.notify, notify.mobile_app_*, etc.)."
              >
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 md:flex-row">
                    <div className="flex-1">
                      <DatalistInput
                        listId="haNotifyServices"
                        options={haNotifyServicesQuery.data ?? []}
                        value={haNotifyServicePicker}
                        onChange={(e) => setHaNotifyServicePicker(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return
                          e.preventDefault()
                          const next = haNotifyServicePicker.trim()
                          if (!next) return
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  homeAssistantNotifyServices: Array.from(
                                    new Set([...prev.homeAssistantNotifyServices, next])
                                  ),
                                }
                              : prev
                          )
                          setHaNotifyServicePicker('')
                        }}
                        disabled={!isAdmin || isLoading}
                        placeholder="Start typing a notify service…"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!isAdmin || isLoading}
                      onClick={() => {
                        const next = haNotifyServicePicker.trim()
                        if (!next) return
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                homeAssistantNotifyServices: Array.from(
                                  new Set([...prev.homeAssistantNotifyServices, next])
                                ),
                              }
                            : prev
                        )
                        setHaNotifyServicePicker('')
                      }}
                    >
                      Add
                    </Button>
                  </div>

                  {draft.homeAssistantNotifyServices.length ? (
                    <div className="flex flex-wrap gap-2">
                      {draft.homeAssistantNotifyServices.map((service) => (
                        <Pill key={service} className="gap-1 pr-1">
                          <span>{service}</span>
                          <IconButton
                            type="button"
                            variant="ghost"
                            className="h-5 w-5"
                            onClick={() =>
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      homeAssistantNotifyServices: prev.homeAssistantNotifyServices.filter(
                                        (s) => s !== service
                                      ),
                                    }
                                  : prev
                              )
                            }
                            aria-label={`Remove notify service ${service}`}
                            disabled={!isAdmin || isLoading}
                          >
                            <X className="h-3 w-3" />
                          </IconButton>
                        </Pill>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No notify services selected.</div>
                  )}
                </div>
              </FormField>

              <FormField label="States" help="Choose which state changes generate a Home Assistant notification.">
                <div className="grid gap-2">
                  {HA_NOTIFY_STATE_OPTIONS.map((state) => {
                    const checked = draft.homeAssistantNotifyStates.includes(state)
                    const tooltip = `Notify when the alarm enters ${AlarmStateLabels[state]}.`
                    return (
                      <label key={state} className="flex items-center gap-3 rounded-md border border-input px-3 py-2">
                        <Checkbox
                          checked={checked}
                          onChange={() =>
                            setDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    homeAssistantNotifyStates: toggleState(prev.homeAssistantNotifyStates, state),
                                  }
                                : prev
                            )
                          }
                          disabled={!isAdmin || isLoading || !draft.homeAssistantNotifyEnabled}
                        />
                        <div className="flex items-center gap-2">
                          <div className="text-sm">{AlarmStateLabels[state]}</div>
                          <HelpTip content={tooltip} />
                        </div>
                      </label>
                    )
                  })}
                </div>
              </FormField>
            </div>
          </SectionCard>

          <SectionCard
            title="Home Assistant (MQTT)"
            description="Create and control the Home Assistant alarm entity via MQTT discovery."
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">MQTT status:</span>
                {mqttStatusQuery.data?.connected ? (
                  <Pill className="text-emerald-600">Connected</Pill>
                ) : mqttStatusQuery.data?.enabled ? (
                  <Pill className="text-amber-600">Disconnected</Pill>
                ) : (
                  <Pill className="text-muted-foreground">Disabled</Pill>
                )}
                {mqttStatusQuery.data?.lastError ? (
                  <span className="text-muted-foreground">({mqttStatusQuery.data.lastError})</span>
                ) : null}
              </div>

              <div className="text-sm text-muted-foreground">
                Broker:{' '}
                {mqttSettingsQuery.data?.host
                  ? `${mqttSettingsQuery.data.host}:${mqttSettingsQuery.data.port}`
                  : 'Not configured'}
              </div>
              <div className="text-sm text-muted-foreground">
                Alarm entity: {mqttEntityQuery.data?.enabled ? mqttEntityQuery.data.haEntityId : 'Disabled'}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => navigate(Routes.SETUP_MQTT)} disabled={!isAdmin}>
                  Configure MQTT
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    void mqttStatusQuery.refetch()
                    void mqttSettingsQuery.refetch()
                    void mqttEntityQuery.refetch()
                  }}
                >
                  Refresh
                </Button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Z-Wave JS"
            description="Connect to Z-Wave JS UI / zwave-js-server via WebSocket."
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Z-Wave status:</span>
                {zwavejsStatusQuery.data?.connected ? (
                  <Pill className="text-emerald-600">Connected</Pill>
                ) : zwavejsStatusQuery.data?.enabled ? (
                  <Pill className="text-amber-600">Disconnected</Pill>
                ) : (
                  <Pill className="text-muted-foreground">Disabled</Pill>
                )}
                {zwavejsStatusQuery.data?.lastError ? (
                  <span className="text-muted-foreground">({zwavejsStatusQuery.data.lastError})</span>
                ) : null}
              </div>

              <div className="text-sm text-muted-foreground">
                WebSocket: {zwavejsSettingsQuery.data?.wsUrl ? zwavejsSettingsQuery.data.wsUrl : 'Not configured'}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => navigate(Routes.SETUP_ZWAVEJS)} disabled={!isAdmin}>
                  Configure Z-Wave JS
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    void zwavejsStatusQuery.refetch()
                    void zwavejsSettingsQuery.refetch()
                  }}
                >
                  Refresh
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </Page>
  )
}

export default SettingsPage

function draftFromSettings(settings: AlarmSettingsProfile): SettingsDraft {
  const getOverrideInt = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(value)) return null
    return Math.max(0, Math.floor(value))
  }

  const armingTimeDefault = getOverrideInt(settings.armingTime) ?? 0
  const overrides = normalizeStateOverrides(settings.stateOverrides ?? {})
  const armingTimeHome = getOverrideInt(overrides[AlarmState.ARMED_HOME]?.armingTime) ?? armingTimeDefault
  const armingTimeAway = getOverrideInt(overrides[AlarmState.ARMED_AWAY]?.armingTime) ?? armingTimeDefault
  const armingTimeNight = getOverrideInt(overrides[AlarmState.ARMED_NIGHT]?.armingTime) ?? armingTimeDefault
  const armingTimeVacation = getOverrideInt(overrides[AlarmState.ARMED_VACATION]?.armingTime) ?? armingTimeDefault

  const haNotify = settings.homeAssistantNotify ?? null
  const cooldown = (() => {
    const value = haNotify?.cooldownSeconds
    return getOverrideInt(value) ?? 0
  })()
  const selectedStates = Array.isArray(haNotify?.states) ? haNotify!.states : []
  const services = (() => {
    const list = Array.isArray(haNotify?.services) ? haNotify!.services : null
    if (list && list.every((s) => typeof s === 'string')) return list.filter(Boolean)
    const single = typeof haNotify?.service === 'string' ? haNotify.service : 'notify.notify'
    return [single].filter(Boolean)
  })()
  return {
    delayTime: String(settings.delayTime ?? 0),
    armingTime: String(settings.armingTime ?? 0),
    armingTimeHome: String(armingTimeHome),
    armingTimeAway: String(armingTimeAway),
    armingTimeNight: String(armingTimeNight),
    armingTimeVacation: String(armingTimeVacation),
    triggerTime: String(settings.triggerTime ?? 0),
    disarmAfterTrigger: Boolean(settings.disarmAfterTrigger),
    codeArmRequired: Boolean(settings.codeArmRequired),
    availableArmingStates: Array.isArray(settings.availableArmingStates) ? settings.availableArmingStates : [],
    homeAssistantNotifyEnabled: Boolean(haNotify?.enabled),
    homeAssistantNotifyServices: services.length ? services : ['notify.notify'],
    homeAssistantNotifyCooldownSeconds: String(cooldown),
    homeAssistantNotifyStates: selectedStates.filter((state) => HA_NOTIFY_STATE_OPTIONS.includes(state)),
  }
}

function parseNonNegativeInt(label: string, value: string): { ok: true; value: number } | { ok: false; error: string } {
  if (value.trim() === '') return { ok: false, error: `${label} is required.` }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return { ok: false, error: `${label} must be a number.` }
  if (parsed < 0) return { ok: false, error: `${label} cannot be negative.` }
  return { ok: true, value: parsed }
}

function parseDraft(
  draft: SettingsDraft
):
  | {
      ok: true
      value: {
        delayTime: number
        armingTime: number
        armingTimeHome: number
        armingTimeAway: number
        armingTimeNight: number
        armingTimeVacation: number
        triggerTime: number
        disarmAfterTrigger: boolean
        codeArmRequired: boolean
        availableArmingStates: AlarmStateType[]
        homeAssistantNotify: {
          enabled: boolean
          services: string[]
          cooldownSeconds: number
          states: AlarmStateType[]
        }
      }
    }
  | { ok: false; error: string } {
  const delayTime = parseNonNegativeInt('Entry delay', draft.delayTime)
  if (!delayTime.ok) return delayTime
  const armingTime = parseNonNegativeInt('Exit delay', draft.armingTime)
  if (!armingTime.ok) return armingTime
  const armingTimeHome = parseNonNegativeInt(`Exit delay (${AlarmStateLabels[AlarmState.ARMED_HOME]})`, draft.armingTimeHome)
  if (!armingTimeHome.ok) return armingTimeHome
  const armingTimeAway = parseNonNegativeInt(`Exit delay (${AlarmStateLabels[AlarmState.ARMED_AWAY]})`, draft.armingTimeAway)
  if (!armingTimeAway.ok) return armingTimeAway
  const armingTimeNight = parseNonNegativeInt(
    `Exit delay (${AlarmStateLabels[AlarmState.ARMED_NIGHT]})`,
    draft.armingTimeNight
  )
  if (!armingTimeNight.ok) return armingTimeNight
  const armingTimeVacation = parseNonNegativeInt(
    `Exit delay (${AlarmStateLabels[AlarmState.ARMED_VACATION]})`,
    draft.armingTimeVacation
  )
  if (!armingTimeVacation.ok) return armingTimeVacation
  const triggerTime = parseNonNegativeInt('Trigger time', draft.triggerTime)
  if (!triggerTime.ok) return triggerTime

  const modes = draft.availableArmingStates.filter((s) => ARM_MODE_OPTIONS.includes(s))
  if (modes.length === 0) return { ok: false, error: 'Select at least one arm mode.' }

  const cooldownSeconds = parseNonNegativeInt('Cooldown', draft.homeAssistantNotifyCooldownSeconds)
  if (!cooldownSeconds.ok) return cooldownSeconds

  const notifyServices = draft.homeAssistantNotifyServices.map((s) => s.trim()).filter(Boolean)
  if (draft.homeAssistantNotifyEnabled && notifyServices.length === 0) {
    return { ok: false, error: 'Select at least one notify service.' }
  }
  if (draft.homeAssistantNotifyEnabled && notifyServices.some((s) => !s.includes('.'))) {
    return { ok: false, error: 'Notify service must look like notify.notify or notify.mobile_app_*.' }
  }

  const notifyStates = draft.homeAssistantNotifyStates.filter((s) => HA_NOTIFY_STATE_OPTIONS.includes(s))

  return {
    ok: true,
    value: {
      delayTime: delayTime.value,
      armingTime: armingTime.value,
      armingTimeHome: armingTimeHome.value,
      armingTimeAway: armingTimeAway.value,
      armingTimeNight: armingTimeNight.value,
      armingTimeVacation: armingTimeVacation.value,
      triggerTime: triggerTime.value,
      disarmAfterTrigger: draft.disarmAfterTrigger,
      codeArmRequired: draft.codeArmRequired,
      availableArmingStates: modes,
      homeAssistantNotify: {
        enabled: draft.homeAssistantNotifyEnabled,
        services: notifyServices.length ? notifyServices : ['notify.notify'],
        cooldownSeconds: cooldownSeconds.value,
        states: notifyStates,
      },
    },
  }
}

function toggleState(states: AlarmStateType[], state: AlarmStateType): AlarmStateType[] {
  if (states.includes(state)) return states.filter((s) => s !== state)
  return [...states, state]
}

function normalizeStateOverrides(value: unknown): Record<string, Record<string, unknown>> {
  if (!isRecord(value)) return {}
  const out: Record<string, Record<string, unknown>> = {}
  for (const [rawKey, rawOverride] of Object.entries(value)) {
    if (!rawKey) continue
    const normalizedKey = rawKey.includes('_')
      ? rawKey
      : rawKey
          .replace(/([A-Z])/g, '_$1')
          .replace(/__/g, '_')
          .toLowerCase()
    if (!isRecord(rawOverride)) continue
    out[normalizedKey] = rawOverride
  }
  return out
}
