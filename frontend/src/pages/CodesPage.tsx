import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores'
import { codesService, usersService } from '@/services'
import { AlarmState, AlarmStateLabels, UserRole } from '@/lib/constants'
import type { AlarmStateType, UserRoleType } from '@/lib/constants'
import type { AlarmCode, CreateCodeRequest, UpdateCodeRequest, User } from '@/types'
import { queryKeys } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DateTimeRangePicker } from '@/components/ui/date-time-range-picker'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'
import { HelpTip } from '@/components/ui/help-tip'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'

type CreateCodeTypeOption = 'permanent' | 'temporary'

const ARMABLE_STATES: AlarmStateType[] = [
  AlarmState.ARMED_HOME,
  AlarmState.ARMED_AWAY,
  AlarmState.ARMED_NIGHT,
  AlarmState.ARMED_VACATION,
  AlarmState.ARMED_CUSTOM_BYPASS,
]

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

function isAdminRole(role: UserRoleType | undefined): boolean {
  return role === UserRole.ADMIN
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const maybe = err as { message?: unknown }
    if (typeof maybe.message === 'string' && maybe.message.trim()) return maybe.message
  }
  return fallback
}

function toUtcIsoFromDatetimeLocal(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60_000
  const local = new Date(date.getTime() - offsetMs)
  return local.toISOString().slice(0, 16)
}

function daysMaskToSet(mask: number): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < 7; i += 1) {
    if ((mask & (1 << i)) !== 0) out.add(i)
  }
  return out
}

function daysSetToMask(days: Set<number>): number {
  let mask = 0
  for (const day of days) mask |= 1 << day
  return mask
}

function formatDaysMask(mask: number): string {
  if (mask === 127) return 'Every day'
  const names: string[] = []
  for (let i = 0; i < 7; i += 1) {
    if ((mask & (1 << i)) !== 0) names.push(DAY_LABELS[i])
  }
  return names.length ? names.join(', ') : 'No days'
}

export function CodesPage() {
  return <CodesPageContent />
}

function CodesPageContent() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isAdmin = isAdminRole(user?.role)

  const [selectedUserId, setSelectedUserId] = useState<string>('')

  const usersQuery = useQuery({
    queryKey: queryKeys.users.all,
    queryFn: usersService.listUsers,
    enabled: isAdmin,
  })

  const selectedUserIdOrDefault = selectedUserId || user?.id || ''
  const targetUserId = isAdmin ? selectedUserIdOrDefault : user?.id || ''

  const codesQueryKey = useMemo(() => ['codes', targetUserId], [targetUserId])

  const codesQuery = useQuery({
    queryKey: codesQueryKey,
    queryFn: () => codesService.getCodes(isAdmin ? { userId: targetUserId } : undefined),
    enabled: !!targetUserId,
  })

  const createMutation = useMutation({
    mutationFn: (req: CreateCodeRequest) => codesService.createCode(req),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: codesQueryKey })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateCodeRequest }) => codesService.updateCode(id, req),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: codesQueryKey })
    },
  })

  const [createLabel, setCreateLabel] = useState<string>('')
  const [createCode, setCreateCode] = useState<string>('')
  const [createCodeType, setCreateCodeType] = useState<CreateCodeTypeOption>('permanent')
  const [createStartAtLocal, setCreateStartAtLocal] = useState<string>('')
  const [createEndAtLocal, setCreateEndAtLocal] = useState<string>('')
  const [createDays, setCreateDays] = useState<Set<number>>(() => daysMaskToSet(127))
  const [createWindowStart, setCreateWindowStart] = useState<string>('')
  const [createWindowEnd, setCreateWindowEnd] = useState<string>('')
  const [createAllowedStates, setCreateAllowedStates] = useState<AlarmStateType[]>(ARMABLE_STATES)
  const [createReauthPassword, setCreateReauthPassword] = useState<string>('')
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingCode, setEditingCode] = useState<AlarmCode | null>(null)
  const [editingCodeId, setEditingCodeId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState<string>('')
  const [editNewCode, setEditNewCode] = useState<string>('')
  const [editIsActive, setEditIsActive] = useState<boolean>(true)
  const [editStartAtLocal, setEditStartAtLocal] = useState<string>('')
  const [editEndAtLocal, setEditEndAtLocal] = useState<string>('')
  const [editDays, setEditDays] = useState<Set<number>>(() => daysMaskToSet(127))
  const [editWindowStart, setEditWindowStart] = useState<string>('')
  const [editWindowEnd, setEditWindowEnd] = useState<string>('')
  const [editAllowedStates, setEditAllowedStates] = useState<AlarmStateType[]>([])
  const [editReauthPassword, setEditReauthPassword] = useState<string>('')
  const [editError, setEditError] = useState<string | null>(null)

  const usersForSelect: User[] = usersQuery.data || []

  const canManage = isAdmin
  const selectedUserDisplay = (() => {
    if (!isAdmin) return user?.displayName || ''
    const selected = usersForSelect.find((u) => u.id === targetUserId)
    return selected?.displayName || selected?.email || ''
  })()

  const beginEdit = (code: AlarmCode) => {
    setEditingCode(code)
    setEditingCodeId(code.id)
    setEditLabel(code.label || '')
    setEditNewCode('')
    setEditIsActive(code.isActive)
    setEditStartAtLocal(toDatetimeLocalValue(code.startAt))
    setEditEndAtLocal(toDatetimeLocalValue(code.endAt))
    setEditDays(daysMaskToSet(code.daysOfWeek ?? 127))
    setEditWindowStart(code.windowStart || '')
    setEditWindowEnd(code.windowEnd || '')
    setEditAllowedStates(code.allowedStates || [])
    setEditReauthPassword('')
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingCode(null)
    setEditingCodeId(null)
    setEditError(null)
    setEditReauthPassword('')
  }

  const toggleAllowedState = (
    current: AlarmStateType[],
    state: AlarmStateType,
    nextChecked: boolean
  ): AlarmStateType[] => {
    if (nextChecked) return Array.from(new Set([...current, state]))
    return current.filter((s) => s !== state)
  }

  const validateDigitsCode = (value: string, label: string): string | null => {
    const code = value.trim()
    if (!code) return null
    if (!/^\d+$/.test(code)) return `${label} must be digits only`
    if (code.length < 4 || code.length > 8) return `${label} must be 4–8 digits`
    return null
  }

  const submitCreate = async () => {
    setCreateError(null)
    if (!targetUserId) {
      setCreateError('Select a user first.')
      return
    }
    const codeErr = validateDigitsCode(createCode, 'Code')
    if (codeErr) {
      setCreateError(codeErr)
      return
    }
    if (!createReauthPassword.trim()) {
      setCreateError('Password is required for re-authentication.')
      return
    }
    const startAt = createCodeType === 'temporary' ? toUtcIsoFromDatetimeLocal(createStartAtLocal) : null
    const endAt = createCodeType === 'temporary' ? toUtcIsoFromDatetimeLocal(createEndAtLocal) : null
    if (createCodeType === 'temporary' && startAt && endAt && startAt > endAt) {
      setCreateError('Active until must be after active from.')
      return
    }
    const daysOfWeek = createCodeType === 'temporary' ? daysSetToMask(createDays) : null
    if (createCodeType === 'temporary' && daysOfWeek === 0) {
      setCreateError('Select at least one day.')
      return
    }
    const windowStart = createCodeType === 'temporary' ? (createWindowStart.trim() || null) : null
    const windowEnd = createCodeType === 'temporary' ? (createWindowEnd.trim() || null) : null
    if (createCodeType === 'temporary' && ((windowStart == null) !== (windowEnd == null))) {
      setCreateError('Time window start and end must both be set.')
      return
    }
    if (createCodeType === 'temporary' && windowStart && windowEnd && windowStart >= windowEnd) {
      setCreateError('Time window end must be after start.')
      return
    }
    try {
      await createMutation.mutateAsync({
        userId: targetUserId,
        label: createLabel.trim(),
        code: createCode.trim(),
        codeType: createCodeType,
        startAt,
        endAt,
        daysOfWeek,
        windowStart,
        windowEnd,
        allowedStates: createAllowedStates,
        reauthPassword: createReauthPassword,
      })
      setCreateLabel('')
      setCreateCode('')
      setCreateCodeType('permanent')
      setCreateStartAtLocal('')
      setCreateEndAtLocal('')
      setCreateDays(daysMaskToSet(127))
      setCreateWindowStart('')
      setCreateWindowEnd('')
      setCreateAllowedStates(ARMABLE_STATES)
      setCreateReauthPassword('')
    } catch (err) {
      setCreateError(getErrorMessage(err, 'Failed to create code'))
    }
  }

  const submitEdit = async () => {
    setEditError(null)
    if (editingCodeId == null) return
    const codeErr = validateDigitsCode(editNewCode, 'New code')
    if (codeErr) {
      setEditError(codeErr)
      return
    }
    if (!editReauthPassword.trim()) {
      setEditError('Password is required for re-authentication.')
      return
    }
    const startAt = toUtcIsoFromDatetimeLocal(editStartAtLocal)
    const endAt = toUtcIsoFromDatetimeLocal(editEndAtLocal)
    if (startAt && endAt && startAt > endAt) {
      setEditError('Active until must be after active from.')
      return
    }
    const isTemporary = editingCode?.codeType === 'temporary'
    const daysOfWeek = isTemporary ? daysSetToMask(editDays) : null
    if (isTemporary && daysOfWeek === 0) {
      setEditError('Select at least one day.')
      return
    }
    const windowStart = isTemporary ? (editWindowStart.trim() || null) : null
    const windowEnd = isTemporary ? (editWindowEnd.trim() || null) : null
    if (isTemporary && ((windowStart == null) !== (windowEnd == null))) {
      setEditError('Time window start and end must both be set.')
      return
    }
    if (isTemporary && windowStart && windowEnd && windowStart >= windowEnd) {
      setEditError('Time window end must be after start.')
      return
    }
    const req: UpdateCodeRequest = {
      label: editLabel.trim(),
      isActive: editIsActive,
      startAt,
      endAt,
      daysOfWeek,
      windowStart,
      windowEnd,
      allowedStates: editAllowedStates,
      reauthPassword: editReauthPassword,
    }
    if (editNewCode.trim()) req.code = editNewCode.trim()

    try {
      await updateMutation.mutateAsync({ id: editingCodeId, req })
      cancelEdit()
    } catch (err) {
      setEditError(getErrorMessage(err, 'Failed to update code'))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Codes" />

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Manage User Codes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="user">
                  User
                </label>
                <Select
                  id="user"
                  value={selectedUserIdOrDefault}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  disabled={usersQuery.isLoading || usersQuery.isError}
                >
                  {usersForSelect.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.email})
                    </option>
                  ))}
                </Select>
                {usersQuery.isError && (
                  <p className="text-sm text-destructive">
                    Failed to load users: {getErrorMessage(usersQuery.error, 'Unknown error')}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Selected</label>
                <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
                  {selectedUserDisplay || '—'}
                </div>
              </div>
            </div>

            <div className="rounded-md border border-input p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">Create Code</div>
                  <div className="text-sm text-muted-foreground">
                    Codes are secrets; they can’t be viewed after creation.
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="create-type">
                      Type
                    </label>
                    <HelpTip content="Temporary codes can have date/time and day-of-week restrictions. Permanent codes are always valid (unless deactivated)." />
                  </div>
                  <Select
                    id="create-type"
                    value={createCodeType}
                    onChange={(e) => setCreateCodeType(e.target.value as CreateCodeTypeOption)}
                    disabled={createMutation.isPending}
                  >
                    <option value="permanent">Permanent</option>
                    <option value="temporary">Temporary</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="create-label">
                    Label (optional)
                  </label>
                  <Input
                    id="create-label"
                    value={createLabel}
                    onChange={(e) => setCreateLabel(e.target.value)}
                    placeholder="Front door"
                    disabled={createMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="create-code">
                    Code (4–8 digits)
                  </label>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      Codes are never shown again after creation.
                    </div>
                    <HelpTip content="Codes are stored hashed on the server. Enter a 4–8 digit PIN; you cannot view it later." />
                  </div>
                  <Input
                    id="create-code"
                    value={createCode}
                    onChange={(e) => setCreateCode(e.target.value)}
                    placeholder="••••"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    disabled={createMutation.isPending}
                  />
                </div>
              </div>

              {createCodeType === 'temporary' && (
                <div className="mt-4">
                  <DateTimeRangePicker
                    label="Active window (optional)"
                    value={{ start: createStartAtLocal, end: createEndAtLocal }}
                    onChange={(next) => {
                      setCreateStartAtLocal(next.start)
                      setCreateEndAtLocal(next.end)
                    }}
                    disabled={createMutation.isPending}
                  />
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <HelpTip content="If set, the code only works between these timestamps (in the user's local timezone). Leave blank for no overall date range." />
                    <span>Optional overall validity window.</span>
                  </div>
                </div>
              )}

              {createCodeType === 'temporary' && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">Days allowed</div>
                      <HelpTip content="Restrict which weekdays this code can be used. Mon=0 … Sun=6 internally." />
                    </div>
                    <div className="flex flex-wrap gap-2">
	                      {DAY_LABELS.map((label, idx) => (
	                        <label key={label} className="flex items-center gap-2 text-sm">
	                          <Checkbox
	                            checked={createDays.has(idx)}
	                            onChange={(e) => {
	                              const checked = e.target.checked
	                              setCreateDays((cur) => {
	                                const next = new Set(cur)
                                if (checked) next.add(idx)
                                else next.delete(idx)
                                return next
                              })
	                            }}
	                            disabled={createMutation.isPending}
	                          />
	                          {label}
	                        </label>
	                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDaysMask(daysSetToMask(createDays))}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium" htmlFor="create-window-start">
                          Time window start (optional)
                        </label>
                        <HelpTip content="If set (with an end time), the code is only valid during this daily time window in the user's local timezone." />
                      </div>
                      <Input
                        id="create-window-start"
                        type="time"
                        value={createWindowStart}
                        onChange={(e) => setCreateWindowStart(e.target.value)}
                        disabled={createMutation.isPending}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium" htmlFor="create-window-end">
                          Time window end (optional)
                        </label>
                        <HelpTip content="End must be after start (same-day window). Leave both blank for no daily time restriction." />
                      </div>
                      <Input
                        id="create-window-end"
                        type="time"
                        value={createWindowEnd}
                        onChange={(e) => setCreateWindowEnd(e.target.value)}
                        disabled={createMutation.isPending}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">Allowed Arm States</div>
                  <HelpTip content="Controls which armed states this code is allowed to arm into. (Disarm is still allowed if the code is otherwise valid.)" />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
	                  {ARMABLE_STATES.map((state) => (
	                    <label key={state} className="flex items-center gap-2 text-sm">
	                      <Checkbox
	                        checked={createAllowedStates.includes(state)}
	                        onChange={(e) =>
	                          setCreateAllowedStates((cur) =>
	                            toggleAllowedState(cur, state, e.target.checked)
                          )
                        }
	                        disabled={createMutation.isPending}
	                      />
	                      {AlarmStateLabels[state]}
	                    </label>
	                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium" htmlFor="create-password">
                    Re-authenticate (password)
                  </label>
                  <HelpTip content="Required to create or modify codes. This prevents someone with an unlocked session from changing codes silently." />
                </div>
                <Input
                  id="create-password"
                  type="password"
                  value={createReauthPassword}
                  onChange={(e) => setCreateReauthPassword(e.target.value)}
                  placeholder="Your account password"
                  disabled={createMutation.isPending}
                />
              </div>

              {createError && (
                <Alert variant="error" layout="inline" className="mt-4">
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )}

              <div className="mt-4 flex justify-end">
                <Button onClick={submitCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create Code'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Your Codes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Ask an admin to create or update codes for your account.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Codes {selectedUserDisplay ? <span className="text-muted-foreground">({selectedUserDisplay})</span> : null}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {codesQuery.isLoading && (
            <div className="text-sm text-muted-foreground">Loading codes…</div>
          )}
          {codesQuery.isError && (
            <div className="text-sm text-destructive">
              Failed to load codes: {getErrorMessage(codesQuery.error, 'Unknown error')}
            </div>
          )}
          {!codesQuery.isLoading && !codesQuery.isError && (codesQuery.data || []).length === 0 && (
            <div className="text-sm text-muted-foreground">No codes found.</div>
          )}

          {(codesQuery.data || []).map((code) => (
            <div key={code.id} className="rounded-md border border-input p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{code.label || 'Untitled code'}</div>
                    <Badge variant={code.isActive ? 'secondary' : 'outline'}>
                      {code.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    PIN length: {code.pinLength} • Type: {code.codeType}
                  </div>
                  {code.codeType === 'temporary' && (
                    <div className="text-sm text-muted-foreground">
                      Days: {formatDaysMask(code.daysOfWeek ?? 127)}
                      {code.windowStart && code.windowEnd ? ` • Time: ${code.windowStart}–${code.windowEnd}` : ''}
                    </div>
                  )}
                  {code.codeType === 'temporary' && (code.startAt || code.endAt) && (
                    <div className="text-sm text-muted-foreground">
                      Active window:{' '}
                      {code.startAt ? new Date(code.startAt).toLocaleString() : '—'} →{' '}
                      {code.endAt ? new Date(code.endAt).toLocaleString() : '—'}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(code.allowedStates || []).length === 0 ? (
                      <span className="text-sm text-muted-foreground">No allowed arm states</span>
                    ) : (
                      code.allowedStates.map((state) => (
                        <Badge key={state} variant="outline">
                          {AlarmStateLabels[state] || state}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={() => beginEdit(code)}>
                      Edit
                    </Button>
                  </div>
                )}
              </div>

              {canManage && editingCodeId === code.id && (
                <div className="mt-4 space-y-4 border-t border-input pt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor={`edit-label-${code.id}`}>
                        Label
                      </label>
                      <Input
                        id={`edit-label-${code.id}`}
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        disabled={updateMutation.isPending}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor={`edit-code-${code.id}`}>
                        New code (optional)
                      </label>
                      <Input
                        id={`edit-code-${code.id}`}
                        value={editNewCode}
                        onChange={(e) => setEditNewCode(e.target.value)}
                        placeholder="4–8 digits"
                        inputMode="numeric"
                        autoComplete="off"
                        disabled={updateMutation.isPending}
                      />
                    </div>
                  </div>

                  {code.codeType === 'temporary' && (
                    <DateTimeRangePicker
                      label="Active window (optional)"
                      value={{ start: editStartAtLocal, end: editEndAtLocal }}
                      onChange={(next) => {
                        setEditStartAtLocal(next.start)
                        setEditEndAtLocal(next.end)
                      }}
                      disabled={updateMutation.isPending}
                    />
                  )}

                  {code.codeType === 'temporary' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Days allowed</div>
                        <div className="flex flex-wrap gap-2">
                          {DAY_LABELS.map((label, idx) => (
                            <label key={label} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={editDays.has(idx)}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setEditDays((cur) => {
                            const next = new Set(cur)
                                    if (checked) next.add(idx)
                                    else next.delete(idx)
                                    return next
                                  })
                                }}
                        disabled={updateMutation.isPending}
                      />
                              {label}
                            </label>
                          ))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDaysMask(daysSetToMask(editDays))}
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium" htmlFor={`edit-window-start-${code.id}`}>
                            Time window start (optional)
                          </label>
                          <Input
                            id={`edit-window-start-${code.id}`}
                            type="time"
                            value={editWindowStart}
                            onChange={(e) => setEditWindowStart(e.target.value)}
                            disabled={updateMutation.isPending}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium" htmlFor={`edit-window-end-${code.id}`}>
                            Time window end (optional)
                          </label>
                          <Input
                            id={`edit-window-end-${code.id}`}
                            type="time"
                            value={editWindowEnd}
                            onChange={(e) => setEditWindowEnd(e.target.value)}
                            disabled={updateMutation.isPending}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">Allowed Arm States</div>
                      <HelpTip content="Controls which armed states this code is allowed to arm into." />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
	                  {ARMABLE_STATES.map((state) => (
	                    <label key={state} className="flex items-center gap-2 text-sm">
	                      <Checkbox
	                        checked={editAllowedStates.includes(state)}
	                        onChange={(e) =>
	                          setEditAllowedStates((cur) =>
	                            toggleAllowedState(cur, state, e.target.checked)
                              )
                            }
	                        disabled={updateMutation.isPending}
	                      />
	                      {AlarmStateLabels[state]}
	                    </label>
	                  ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editIsActive}
                      onCheckedChange={setEditIsActive}
                      disabled={updateMutation.isPending}
                      aria-labelledby={`code-active-label-${editingCodeId ?? 'new'}`}
                    />
                    <span id={`code-active-label-${editingCodeId ?? 'new'}`} className="text-sm">
                      Active
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium" htmlFor={`edit-password-${code.id}`}>
                        Re-authenticate (password)
                      </label>
                      <HelpTip content="Required to save changes to this code." />
                    </div>
                    <Input
                      id={`edit-password-${code.id}`}
                      type="password"
                      value={editReauthPassword}
                      onChange={(e) => setEditReauthPassword(e.target.value)}
                      placeholder="Your account password"
                      disabled={updateMutation.isPending}
                    />
                  </div>

                  {editError && (
                    <Alert variant="error" layout="inline">
                      <AlertDescription>{editError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <Button variant="secondary" onClick={cancelEdit} disabled={updateMutation.isPending}>
                      Cancel
                    </Button>
                    <Button onClick={submitEdit} disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export default CodesPage
