import { useMemo, useState } from 'react'
import { useCurrentUserQuery } from '@/hooks/useAuthQueries'
import { useUsersQuery } from '@/hooks/useCodesQueries'
import { useEntitiesQuery, useSyncEntitiesMutation } from '@/hooks/useRulesQueries'
import {
  useCreateDoorCodeMutation,
  useDeleteDoorCodeMutation,
  useDoorCodesQuery,
  useUpdateDoorCodeMutation,
} from '@/hooks/useDoorCodesQueries'
import { UserRole } from '@/lib/constants'
import { getErrorMessage } from '@/types/errors'
import type { DoorCode, UpdateDoorCodeRequest, User } from '@/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateTimeRangePicker } from '@/components/ui/date-time-range-picker'
import { EmptyState } from '@/components/ui/empty-state'
import { HelpTip } from '@/components/ui/help-tip'
import { Input } from '@/components/ui/input'
import { LoadingInline } from '@/components/ui/loading-inline'
import { Page } from '@/components/layout'
import { SectionCard } from '@/components/ui/section-card'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

type DoorCodeTypeOption = 'permanent' | 'temporary'

function isAdminRole(role: string | undefined): boolean {
  return role === UserRole.ADMIN
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

function validateDigitsCode(value: string, label: string): string | null {
  const code = value.trim()
  if (!code) return `${label} is required`
  if (!/^\d+$/.test(code)) return `${label} must be digits only`
  if (code.length < 4 || code.length > 8) return `${label} must be 4–8 digits`
  return null
}

function normalizeEntityId(value: string): string {
  return value.trim()
}

export function DoorCodesPage() {
  const currentUserQuery = useCurrentUserQuery()
  const user = currentUserQuery.data ?? null
  const isAdmin = isAdminRole(user?.role)

  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const usersQuery = useUsersQuery(isAdmin)
  const usersForSelect: User[] = usersQuery.data || []

  const selectedUserIdOrDefault = selectedUserId || user?.id || ''
  const targetUserId = isAdmin ? selectedUserIdOrDefault : user?.id || ''

  const doorCodesQuery = useDoorCodesQuery({ userId: targetUserId, isAdmin })
  const entitiesQuery = useEntitiesQuery()
  const syncEntitiesMutation = useSyncEntitiesMutation()

  const createMutation = useCreateDoorCodeMutation(targetUserId)
  const updateMutation = useUpdateDoorCodeMutation(targetUserId)
  const deleteMutation = useDeleteDoorCodeMutation(targetUserId)

  const [createLabel, setCreateLabel] = useState<string>('')
  const [createCode, setCreateCode] = useState<string>('')
  const [createCodeType, setCreateCodeType] = useState<DoorCodeTypeOption>('permanent')
  const [createStartAtLocal, setCreateStartAtLocal] = useState<string>('')
  const [createEndAtLocal, setCreateEndAtLocal] = useState<string>('')
  const [createDays, setCreateDays] = useState<Set<number>>(() => daysMaskToSet(127))
  const [createWindowStart, setCreateWindowStart] = useState<string>('')
  const [createWindowEnd, setCreateWindowEnd] = useState<string>('')
  const [createMaxUses, setCreateMaxUses] = useState<string>('')
  const [createSelectedLocks, setCreateSelectedLocks] = useState<Set<string>>(() => new Set())
  const [createManualLockIds, setCreateManualLockIds] = useState<string>('')
  const [createLockSearch, setCreateLockSearch] = useState<string>('')
  const [createReauthPassword, setCreateReauthPassword] = useState<string>('')
  const [createError, setCreateError] = useState<string | null>(null)

  const [editingCode, setEditingCode] = useState<DoorCode | null>(null)
  const [editingCodeId, setEditingCodeId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState<string>('')
  const [editNewCode, setEditNewCode] = useState<string>('')
  const [editIsActive, setEditIsActive] = useState<boolean>(true)
  const [editStartAtLocal, setEditStartAtLocal] = useState<string>('')
  const [editEndAtLocal, setEditEndAtLocal] = useState<string>('')
  const [editDays, setEditDays] = useState<Set<number>>(() => daysMaskToSet(127))
  const [editWindowStart, setEditWindowStart] = useState<string>('')
  const [editWindowEnd, setEditWindowEnd] = useState<string>('')
  const [editMaxUses, setEditMaxUses] = useState<string>('')
  const [editSelectedLocks, setEditSelectedLocks] = useState<Set<string>>(() => new Set())
  const [editManualLockIds, setEditManualLockIds] = useState<string>('')
  const [editLockSearch, setEditLockSearch] = useState<string>('')
  const [editReauthPassword, setEditReauthPassword] = useState<string>('')
  const [editError, setEditError] = useState<string | null>(null)

  const canManage = isAdmin

  const selectedUserDisplay = (() => {
    if (!isAdmin) return user?.displayName || ''
    const selected = usersForSelect.find((u) => u.id === targetUserId)
    return selected?.displayName || selected?.email || ''
  })()

  const lockNameByEntityId = useMemo(() => {
    const map = new Map<string, string>()
    for (const entity of entitiesQuery.data || []) {
      if (entity.domain !== 'lock') continue
      if (entity.entityId && entity.name) map.set(entity.entityId, entity.name)
    }
    return map
  }, [entitiesQuery.data])

  const lockEntities = useMemo(() => {
    return (entitiesQuery.data || []).filter((entity) => entity.domain === 'lock')
  }, [entitiesQuery.data])

  const filteredLocks = useMemo(() => {
    const query = createLockSearch.trim().toLowerCase()
    const locks = lockEntities
    if (!query) return locks
    return locks.filter((lock) => {
      const haystack = `${lock.name} ${lock.entityId}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [lockEntities, createLockSearch])

  const filteredEditLocks = useMemo(() => {
    const query = editLockSearch.trim().toLowerCase()
    const locks = lockEntities
    if (!query) return locks
    return locks.filter((lock) => {
      const haystack = `${lock.name} ${lock.entityId}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [lockEntities, editLockSearch])

  const beginEdit = (code: DoorCode) => {
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
    setEditMaxUses(code.maxUses == null ? '' : String(code.maxUses))
    setEditSelectedLocks(new Set(code.lockEntityIds || []))
    setEditManualLockIds('')
    setEditLockSearch('')
    setEditReauthPassword('')
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingCode(null)
    setEditingCodeId(null)
    setEditError(null)
    setEditReauthPassword('')
  }

  const toggleLock = (current: Set<string>, lockEntityId: string, nextChecked: boolean): Set<string> => {
    const next = new Set(current)
    if (nextChecked) next.add(lockEntityId)
    else next.delete(lockEntityId)
    return next
  }

  const parseManualLockIds = (raw: string): string[] => {
    return Array.from(
      new Set(
        raw
          .split(/[\s,]+/g)
          .map((item) => normalizeEntityId(item))
          .filter(Boolean)
      )
    )
  }

  const resolveCreateLockEntityIds = (): string[] => {
    const locksFromPicker = Array.from(createSelectedLocks)
    if (locksFromPicker.length) return locksFromPicker
    return parseManualLockIds(createManualLockIds)
  }

  const resolveEditLockEntityIds = (): string[] => {
    const locksFromPicker = Array.from(editSelectedLocks)
    if (locksFromPicker.length) return locksFromPicker
    return parseManualLockIds(editManualLockIds)
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

    const lockEntityIds = resolveCreateLockEntityIds()
    if (!lockEntityIds.length) {
      setCreateError('Select at least one lock.')
      return
    }

    const isTemporary = createCodeType === 'temporary'
    const startAt = isTemporary ? toUtcIsoFromDatetimeLocal(createStartAtLocal) : null
    const endAt = isTemporary ? toUtcIsoFromDatetimeLocal(createEndAtLocal) : null
    if (isTemporary && startAt && endAt && startAt > endAt) {
      setCreateError('Active until must be after active from.')
      return
    }
    const daysOfWeek = isTemporary ? daysSetToMask(createDays) : null
    if (isTemporary && daysOfWeek === 0) {
      setCreateError('Select at least one day.')
      return
    }
    const windowStart = isTemporary ? (createWindowStart.trim() || null) : null
    const windowEnd = isTemporary ? (createWindowEnd.trim() || null) : null
    if (isTemporary && ((windowStart == null) !== (windowEnd == null))) {
      setCreateError('Time window start and end must both be set.')
      return
    }
    if (isTemporary && windowStart && windowEnd && windowStart >= windowEnd) {
      setCreateError('Time window end must be after start.')
      return
    }
    let maxUses: number | null = null
    if (createMaxUses.trim() !== '') {
      const parsed = Number(createMaxUses)
      if (!Number.isInteger(parsed) || parsed < 1) {
        setCreateError('Max uses must be a whole number ≥ 1.')
        return
      }
      maxUses = parsed
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
        maxUses,
        lockEntityIds,
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
      setCreateMaxUses('')
      setCreateSelectedLocks(new Set())
      setCreateManualLockIds('')
      setCreateLockSearch('')
      setCreateReauthPassword('')
    } catch (err) {
      setCreateError(getErrorMessage(err) || 'Failed to create door code')
    }
  }

  const submitEdit = async () => {
    setEditError(null)
    if (editingCodeId == null) return
    const codeErr = editNewCode.trim() ? validateDigitsCode(editNewCode, 'New code') : null
    if (codeErr) {
      setEditError(codeErr)
      return
    }
    if (!editReauthPassword.trim()) {
      setEditError('Password is required for re-authentication.')
      return
    }
    const lockEntityIds = resolveEditLockEntityIds()
    if (!lockEntityIds.length) {
      setEditError('Select at least one lock.')
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
    let maxUses: number | null = null
    if (editMaxUses.trim() !== '') {
      const parsed = Number(editMaxUses)
      if (!Number.isInteger(parsed) || parsed < 1) {
        setEditError('Max uses must be a whole number ≥ 1.')
        return
      }
      maxUses = parsed
    }

    const req: UpdateDoorCodeRequest = {
      label: editLabel.trim(),
      isActive: editIsActive,
      maxUses,
      lockEntityIds,
      reauthPassword: editReauthPassword,
    }

    if (editNewCode.trim()) req.code = editNewCode.trim()
    if (isTemporary) {
      req.startAt = startAt
      req.endAt = endAt
      req.daysOfWeek = daysOfWeek
      req.windowStart = windowStart
      req.windowEnd = windowEnd
    }

    try {
      await updateMutation.mutateAsync({ id: editingCodeId, req })
      cancelEdit()
    } catch (err) {
      setEditError(getErrorMessage(err) || 'Failed to update door code')
    }
  }

  const submitDelete = async (codeId: number) => {
    if (!editingCode) return
    if (!editReauthPassword.trim()) {
      setEditError('Password is required for re-authentication.')
      return
    }
    const ok = window.confirm('Delete this door code? This cannot be undone.')
    if (!ok) return
    try {
      await deleteMutation.mutateAsync({ id: codeId, reauthPassword: editReauthPassword })
      cancelEdit()
    } catch (err) {
      setEditError(getErrorMessage(err) || 'Failed to delete door code')
    }
  }

  const renderLockBadges = (lockEntityIds: string[]) => {
    if (!lockEntityIds.length) return <span className="text-sm text-muted-foreground">No locks</span>
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {lockEntityIds.map((entityId) => (
          <Badge key={entityId} variant="outline">
            {lockNameByEntityId.get(entityId) || entityId}
          </Badge>
        ))}
      </div>
    )
  }

  return (
    <Page title="Door Codes">

      {isAdmin && (
        <SectionCard title="Target User">
          {usersQuery.isLoading && <LoadingInline label="Loading users…" />}
          {usersQuery.isError && (
            <Alert variant="error" layout="inline">
              <AlertDescription>
                Failed to load users: {getErrorMessage(usersQuery.error) || 'Unknown error'}
              </AlertDescription>
            </Alert>
          )}
          {!usersQuery.isLoading && !usersQuery.isError && (
            <div className="max-w-md space-y-2">
              <label className="text-sm font-medium" htmlFor="door-codes-user-select">
                User
              </label>
              <Select
                id="door-codes-user-select"
                value={selectedUserIdOrDefault}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">Select a user…</option>
                {usersForSelect.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.email}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </SectionCard>
      )}

      {canManage && (
        <SectionCard title="Create Door Code" contentClassName="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="door-code-create-type">
                Code type
              </label>
              <Select
                id="door-code-create-type"
                value={createCodeType}
                onChange={(e) => setCreateCodeType(e.target.value as DoorCodeTypeOption)}
                disabled={createMutation.isPending}
              >
                <option value="permanent">Permanent</option>
                <option value="temporary">Temporary</option>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="door-code-create-label">
                Label (optional)
              </label>
              <Input
                id="door-code-create-label"
                value={createLabel}
                onChange={(e) => setCreateLabel(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium" htmlFor="door-code-create-code">
                  Code (PIN)
                </label>
                <HelpTip content="Codes are stored hashed on the server. Enter a 4–8 digit PIN; you cannot view it later." />
              </div>
              <Input
                id="door-code-create-code"
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value)}
                placeholder="4–8 digits"
                inputMode="numeric"
                autoComplete="off"
                disabled={createMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium" htmlFor="door-code-create-max-uses">
                  Max uses (optional)
                </label>
                <HelpTip content="Leave blank for unlimited uses." />
              </div>
              <Input
                id="door-code-create-max-uses"
                type="number"
                min={1}
                step={1}
                value={createMaxUses}
                onChange={(e) => setCreateMaxUses(e.target.value)}
                disabled={createMutation.isPending}
              />
            </div>
          </div>

          {createCodeType === 'temporary' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">Active date range (optional)</div>
                  <HelpTip content="If set, the code is only valid between these timestamps." />
                </div>
                <DateTimeRangePicker
                  label="Active window (optional)"
                  value={{ start: createStartAtLocal, end: createEndAtLocal }}
                  onChange={(next) => {
                    setCreateStartAtLocal(next.start)
                    setCreateEndAtLocal(next.end)
                  }}
                  disabled={createMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">Days of week</div>
                  <HelpTip content="Select which days this code is allowed." />
                </div>
                <div className="flex flex-wrap gap-3">
                  {DAY_LABELS.map((label, idx) => (
                    <label key={label} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={createDays.has(idx)}
                        onChange={(e) => {
                          const next = new Set(createDays)
                          if (e.target.checked) next.add(idx)
                          else next.delete(idx)
                          setCreateDays(next)
                        }}
                        disabled={createMutation.isPending}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">{formatDaysMask(daysSetToMask(createDays))}</div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="door-code-create-window-start">
                    Time window start (optional)
                  </label>
                  <Input
                    id="door-code-create-window-start"
                    type="time"
                    value={createWindowStart}
                    onChange={(e) => setCreateWindowStart(e.target.value)}
                    disabled={createMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="door-code-create-window-end">
                    Time window end (optional)
                  </label>
                  <Input
                    id="door-code-create-window-end"
                    type="time"
                    value={createWindowEnd}
                    onChange={(e) => setCreateWindowEnd(e.target.value)}
                    disabled={createMutation.isPending}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">Locks</div>
              <HelpTip content="Select which locks this code applies to. This list comes from the synced entity registry (same as Rules)." />
            </div>

            {entitiesQuery.isLoading && <LoadingInline label="Loading locks…" />}
            {entitiesQuery.isError && (
              <Alert variant="error" layout="inline">
                <AlertDescription>
                  Could not load entities: {getErrorMessage(entitiesQuery.error) || 'Unknown error'}. Enter lock entity ids manually below.
                </AlertDescription>
              </Alert>
            )}

            {!entitiesQuery.isLoading && !entitiesQuery.isError && lockEntities.length === 0 && (
              <Alert variant="warning" layout="inline">
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>No lock entities found in the registry.</span>
                  <Button
                    variant="secondary"
                    onClick={() => syncEntitiesMutation.mutate()}
                    disabled={syncEntitiesMutation.isPending}
                  >
                    {syncEntitiesMutation.isPending ? 'Syncing…' : 'Sync entities'}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {!entitiesQuery.isError && lockEntities.length > 0 ? (
              <div className="space-y-2">
                <Input
                  value={createLockSearch}
                  onChange={(e) => setCreateLockSearch(e.target.value)}
                  placeholder="Search locks…"
                  disabled={createMutation.isPending}
                />
                <div className="max-h-56 overflow-auto rounded-md border border-input p-3">
                  <div className="space-y-2">
                    {filteredLocks.map((lock) => (
                      <label key={lock.entityId} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={createSelectedLocks.has(lock.entityId)}
                          onChange={(e) =>
                            setCreateSelectedLocks((cur) => toggleLock(cur, lock.entityId, e.target.checked))
                          }
                          disabled={createMutation.isPending}
                        />
                        <span className="truncate">
                          {lock.name} <span className="text-muted-foreground">({lock.entityId})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Selected: {resolveCreateLockEntityIds().length}
                </div>
              </div>
            ) : (
              <Input
                value={createManualLockIds}
                onChange={(e) => setCreateManualLockIds(e.target.value)}
                placeholder="e.g. lock.front_door, lock.back_door"
                disabled={createMutation.isPending}
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" htmlFor="door-code-create-password">
                Re-authenticate (password)
              </label>
              <HelpTip content="Required to create a door code." />
            </div>
            <Input
              id="door-code-create-password"
              type="password"
              value={createReauthPassword}
              onChange={(e) => setCreateReauthPassword(e.target.value)}
              placeholder="Your account password"
              disabled={createMutation.isPending}
            />
          </div>

          {createError && (
            <Alert variant="error" layout="inline">
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-end">
            <Button onClick={submitCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create Door Code'}
            </Button>
          </div>
        </SectionCard>
      )}

      {!isAdmin && (
        <SectionCard title="Your Door Codes" description="Ask an admin to create or update door codes for your account." />
      )}

      <SectionCard
        title={
          <>
            Door Codes{' '}
            {selectedUserDisplay ? <span className="text-muted-foreground">({selectedUserDisplay})</span> : null}
          </>
        }
        contentClassName="space-y-4"
      >
        {doorCodesQuery.isLoading && <LoadingInline label="Loading door codes…" />}
        {doorCodesQuery.isError && (
          <Alert variant="error" layout="inline">
            <AlertDescription>
              Failed to load door codes: {getErrorMessage(doorCodesQuery.error) || 'Unknown error'}
            </AlertDescription>
          </Alert>
        )}
        {!doorCodesQuery.isLoading && !doorCodesQuery.isError && (doorCodesQuery.data || []).length === 0 && (
          <EmptyState title="No door codes found." description="Create a door code above or ask an admin to add one." />
        )}

        {(doorCodesQuery.data || []).map((code) => (
          <div key={code.id} className="rounded-md border border-input p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{code.label || 'Untitled door code'}</div>
                  <Badge variant={code.isActive ? 'secondary' : 'outline'}>
                    {code.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  PIN length: {code.pinLength} • Type: {code.codeType}
                  {code.maxUses != null ? ` • Max uses: ${code.maxUses}` : ''}
                </div>
                {code.codeType === 'temporary' && (
                  <div className="text-sm text-muted-foreground">
                    Days: {formatDaysMask(code.daysOfWeek ?? 127)}
                    {code.windowStart && code.windowEnd ? ` • Time: ${code.windowStart}–${code.windowEnd}` : ''}
                  </div>
                )}
                {code.codeType === 'temporary' && (code.startAt || code.endAt) && (
                  <div className="text-sm text-muted-foreground">
                    Active window: {code.startAt ? new Date(code.startAt).toLocaleString() : '—'} →{' '}
                    {code.endAt ? new Date(code.endAt).toLocaleString() : '—'}
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  Uses: {code.usesCount}
                  {code.lastUsedAt ? ` • Last used: ${new Date(code.lastUsedAt).toLocaleString()}` : ''}
                  {code.lastUsedLock ? ` • Lock: ${lockNameByEntityId.get(code.lastUsedLock) || code.lastUsedLock}` : ''}
                </div>
                {renderLockBadges(code.lockEntityIds || [])}
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
                    <label className="text-sm font-medium" htmlFor={`door-code-edit-label-${code.id}`}>
                      Label
                    </label>
                    <Input
                      id={`door-code-edit-label-${code.id}`}
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      disabled={updateMutation.isPending || deleteMutation.isPending}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor={`door-code-edit-code-${code.id}`}>
                      New code (optional)
                    </label>
                    <Input
                      id={`door-code-edit-code-${code.id}`}
                      value={editNewCode}
                      onChange={(e) => setEditNewCode(e.target.value)}
                      placeholder="4–8 digits"
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={updateMutation.isPending || deleteMutation.isPending}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor={`door-code-edit-max-uses-${code.id}`}>
                      Max uses (optional)
                    </label>
                    <Input
                      id={`door-code-edit-max-uses-${code.id}`}
                      type="number"
                      min={1}
                      step={1}
                      value={editMaxUses}
                      onChange={(e) => setEditMaxUses(e.target.value)}
                      disabled={updateMutation.isPending || deleteMutation.isPending}
                    />
                  </div>
                </div>

                {editingCode?.codeType === 'temporary' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">Active date range (optional)</div>
                        <HelpTip content="If set, the code is only valid between these timestamps." />
                      </div>
                      <DateTimeRangePicker
                        label="Active window (optional)"
                        value={{ start: editStartAtLocal, end: editEndAtLocal }}
                        onChange={(next) => {
                          setEditStartAtLocal(next.start)
                          setEditEndAtLocal(next.end)
                        }}
                        disabled={updateMutation.isPending || deleteMutation.isPending}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">Days of week</div>
                        <HelpTip content="Select which days this code is allowed." />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {DAY_LABELS.map((label, idx) => (
                          <label key={label} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={editDays.has(idx)}
                              onChange={(e) => {
                                const next = new Set(editDays)
                                if (e.target.checked) next.add(idx)
                                else next.delete(idx)
                                setEditDays(next)
                              }}
                              disabled={updateMutation.isPending || deleteMutation.isPending}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDaysMask(daysSetToMask(editDays))}</div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor={`door-code-edit-window-start-${code.id}`}>
                          Time window start (optional)
                        </label>
                        <Input
                          id={`door-code-edit-window-start-${code.id}`}
                          type="time"
                          value={editWindowStart}
                          onChange={(e) => setEditWindowStart(e.target.value)}
                          disabled={updateMutation.isPending || deleteMutation.isPending}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor={`door-code-edit-window-end-${code.id}`}>
                          Time window end (optional)
                        </label>
                        <Input
                          id={`door-code-edit-window-end-${code.id}`}
                          type="time"
                          value={editWindowEnd}
                          onChange={(e) => setEditWindowEnd(e.target.value)}
                          disabled={updateMutation.isPending || deleteMutation.isPending}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">Locks</div>
                    <HelpTip content="Select which Home Assistant locks this code applies to." />
                  </div>

                  {entitiesQuery.isError || lockEntities.length === 0 ? (
                    <Input
                      value={editManualLockIds}
                      onChange={(e) => setEditManualLockIds(e.target.value)}
                      placeholder="e.g. lock.front_door, lock.back_door"
                      disabled={updateMutation.isPending || deleteMutation.isPending}
                    />
                  ) : (
                    <div className="space-y-2">
                      <Input
                        value={editLockSearch}
                        onChange={(e) => setEditLockSearch(e.target.value)}
                        placeholder="Search locks…"
                        disabled={updateMutation.isPending || deleteMutation.isPending}
                      />
                      <div className="max-h-56 overflow-auto rounded-md border border-input p-3">
                        <div className="space-y-2">
                          {(filteredEditLocks || []).map((lock) => (
                            <label key={lock.entityId} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={editSelectedLocks.has(lock.entityId)}
                                onChange={(e) =>
                                  setEditSelectedLocks((cur) => toggleLock(cur, lock.entityId, e.target.checked))
                                }
                                disabled={updateMutation.isPending || deleteMutation.isPending}
                              />
                              <span className="truncate">
                                {lock.name} <span className="text-muted-foreground">({lock.entityId})</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">Selected: {resolveEditLockEntityIds().length}</div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={editIsActive}
                    onCheckedChange={setEditIsActive}
                    disabled={updateMutation.isPending || deleteMutation.isPending}
                    aria-labelledby={`door-code-active-label-${editingCodeId ?? 'new'}`}
                  />
                  <span id={`door-code-active-label-${editingCodeId ?? 'new'}`} className="text-sm">
                    Active
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" htmlFor={`door-code-edit-password-${code.id}`}>
                      Re-authenticate (password)
                    </label>
                    <HelpTip content="Required to save changes or delete this code." />
                  </div>
                  <Input
                    id={`door-code-edit-password-${code.id}`}
                    type="password"
                    value={editReauthPassword}
                    onChange={(e) => setEditReauthPassword(e.target.value)}
                    placeholder="Your account password"
                    disabled={updateMutation.isPending || deleteMutation.isPending}
                  />
                </div>

                {editError && (
                  <Alert variant="error" layout="inline">
                    <AlertDescription>{editError}</AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => submitDelete(code.id)}
                    disabled={updateMutation.isPending || deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={cancelEdit}
                      disabled={updateMutation.isPending || deleteMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button onClick={submitEdit} disabled={updateMutation.isPending || deleteMutation.isPending}>
                      {updateMutation.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </SectionCard>
    </Page>
  )
}

export default DoorCodesPage
