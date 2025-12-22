import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingInline } from '@/components/ui/loading-inline'
import { DatalistInput } from '@/components/ui/datalist-input'
import { getErrorMessage } from '@/lib/errors'
import { AlarmState, AlarmStateLabels, type AlarmStateType, UserRole } from '@/lib/constants'
import type { AlarmSettingsProfile } from '@/types'
import { useAlarmSettingsQuery } from '@/hooks/useAlarmQueries'
import { useCurrentUserQuery } from '@/hooks/useAuthQueries'
import { useHomeAssistantNotifyServices } from '@/hooks/useHomeAssistant'
import { useUpdateSettingsProfileMutation } from '@/hooks/useSettingsQueries'

type SettingsDraft = {
  delayTime: string
  armingTime: string
  triggerTime: string
  disarmAfterTrigger: boolean
  codeArmRequired: boolean
  availableArmingStates: AlarmStateType[]
  homeAssistantNotifyEnabled: boolean
  homeAssistantNotifyService: string
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

export function SettingsPage() {
  const currentUserQuery = useCurrentUserQuery()
  const isAdmin = currentUserQuery.data?.role === UserRole.ADMIN

  const settingsQuery = useAlarmSettingsQuery()
  const haNotifyServicesQuery = useHomeAssistantNotifyServices()
  const updateMutation = useUpdateSettingsProfileMutation()

  const settings = settingsQuery.data ?? null
  const isLoading = settingsQuery.isLoading || updateMutation.isPending

  const initialDraft = useMemo(() => {
    if (!settings) return null
    return draftFromSettings(settings)
  }, [settings])

  const [draft, setDraft] = useState<SettingsDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [hasInitialized, setHasInitialized] = useState(false)

  useEffect(() => {
    if (hasInitialized) return
    if (!initialDraft) return
    setDraft(initialDraft)
    setHasInitialized(true)
  }, [hasInitialized, initialDraft])

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
    <div className="space-y-6">
      <PageHeader title="Settings" />

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
              <FormField label="Entry delay" htmlFor="delayTime" description="Seconds before triggering after an entry sensor trips.">
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

              <FormField label="Exit delay" htmlFor="armingTime" description="Seconds before the system becomes armed.">
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

              <FormField label="Trigger time" htmlFor="triggerTime" description="Seconds the alarm stays triggered before auto behavior.">
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
          </SectionCard>

          <SectionCard title="Behavior" description="Basic behavior toggles.">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Disarm after trigger"
                description="If enabled, auto-disarm after trigger time; otherwise return to the previous armed state."
              >
                <Switch
                  checked={draft.disarmAfterTrigger}
                  onCheckedChange={(checked) => setDraft((prev) => (prev ? { ...prev, disarmAfterTrigger: checked } : prev))}
                  disabled={!isAdmin || isLoading}
                />
              </FormField>

              <FormField
                label="Code required to arm"
                description="If disabled, arming does not require a PIN (disarm still requires a code)."
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
                    <div className="text-sm">{AlarmStateLabels[state]}</div>
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
              <FormField label="Enable" description="Requires Home Assistant to be configured and reachable.">
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
                description="Minimum time between notifications for the same state."
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
                label="Notify service"
                htmlFor="haNotifyService"
                description="Home Assistant notify service in the form notify.notify or notify.mobile_app_*."
              >
                <DatalistInput
                  listId="haNotifyServices"
                  options={haNotifyServicesQuery.data ?? []}
                  id="haNotifyService"
                  value={draft.homeAssistantNotifyService}
                  onChange={(e) =>
                    setDraft((prev) => (prev ? { ...prev, homeAssistantNotifyService: e.target.value } : prev))
                  }
                  disabled={!isAdmin || isLoading}
                  placeholder="notify.notify"
                />
              </FormField>

              <FormField label="States" description="Choose which state changes generate a notification.">
                <div className="grid gap-2">
                  {HA_NOTIFY_STATE_OPTIONS.map((state) => {
                    const checked = draft.homeAssistantNotifyStates.includes(state)
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
                        <div className="text-sm">{AlarmStateLabels[state]}</div>
                      </label>
                    )
                  })}
                </div>
              </FormField>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  )
}

export default SettingsPage

function draftFromSettings(settings: AlarmSettingsProfile): SettingsDraft {
  const haNotify = settings.homeAssistantNotify ?? null
  const cooldown = (() => {
    const value = haNotify?.cooldownSeconds
    if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(value)) return 0
    return Math.max(0, Math.floor(value))
  })()
  const selectedStates = Array.isArray(haNotify?.states) ? haNotify!.states : []
  return {
    delayTime: String(settings.delayTime ?? 0),
    armingTime: String(settings.armingTime ?? 0),
    triggerTime: String(settings.triggerTime ?? 0),
    disarmAfterTrigger: Boolean(settings.disarmAfterTrigger),
    codeArmRequired: Boolean(settings.codeArmRequired),
    availableArmingStates: Array.isArray(settings.availableArmingStates) ? settings.availableArmingStates : [],
    homeAssistantNotifyEnabled: Boolean(haNotify?.enabled),
    homeAssistantNotifyService: typeof haNotify?.service === 'string' ? haNotify.service : 'notify.notify',
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
        triggerTime: number
        disarmAfterTrigger: boolean
        codeArmRequired: boolean
        availableArmingStates: AlarmStateType[]
        homeAssistantNotify: {
          enabled: boolean
          service: string
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
  const triggerTime = parseNonNegativeInt('Trigger time', draft.triggerTime)
  if (!triggerTime.ok) return triggerTime

  const modes = draft.availableArmingStates.filter((s) => ARM_MODE_OPTIONS.includes(s))
  if (modes.length === 0) return { ok: false, error: 'Select at least one arm mode.' }

  const cooldownSeconds = parseNonNegativeInt('Cooldown', draft.homeAssistantNotifyCooldownSeconds)
  if (!cooldownSeconds.ok) return cooldownSeconds

  const notifyService = draft.homeAssistantNotifyService.trim() || 'notify.notify'
  if (draft.homeAssistantNotifyEnabled && !notifyService.includes('.')) {
    return { ok: false, error: 'Notify service must look like notify.notify or notify.mobile_app_*.' }
  }

  const notifyStates = draft.homeAssistantNotifyStates.filter((s) => HA_NOTIFY_STATE_OPTIONS.includes(s))

  return {
    ok: true,
    value: {
      delayTime: delayTime.value,
      armingTime: armingTime.value,
      triggerTime: triggerTime.value,
      disarmAfterTrigger: draft.disarmAfterTrigger,
      codeArmRequired: draft.codeArmRequired,
      availableArmingStates: modes,
      homeAssistantNotify: {
        enabled: draft.homeAssistantNotifyEnabled,
        service: notifyService,
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
