import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingInline } from '@/components/ui/loading-inline'
import { EmptyState } from '@/components/ui/empty-state'
import { getErrorMessage } from '@/lib/errors'
import { UserRole } from '@/lib/constants'
import type { AlarmSettingEntry, AlarmSettingsProfileDetail, AlarmSettingsProfileMeta, SystemConfigRow, SystemConfigValueType } from '@/types'
import { useAlarmSettingsQuery } from '@/hooks/useAlarmQueries'
import { useCurrentUserQuery } from '@/hooks/useAuthQueries'
import {
  useActivateSettingsProfileMutation,
  useCreateSettingsProfileMutation,
  useDeleteSettingsProfileMutation,
  useSettingsProfileDetailQuery,
  useSettingsProfilesQuery,
  useSystemConfigQuery,
  useUpdateSettingsProfileMutation,
  useUpdateSystemConfigMutation,
} from '@/hooks/useSettingsQueries'

export function SettingsPage() {
  const currentUserQuery = useCurrentUserQuery()
  const isAdmin = currentUserQuery.data?.role === UserRole.ADMIN

  const [tab, setTab] = useState<'alarm' | 'system'>('alarm')

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <div className="flex gap-2">
        <Button type="button" variant={tab === 'alarm' ? 'default' : 'secondary'} onClick={() => setTab('alarm')}>
          Alarm profile
        </Button>
        <Button type="button" variant={tab === 'system' ? 'default' : 'secondary'} onClick={() => setTab('system')}>
          System config
        </Button>
      </div>

      {tab === 'alarm' ? <AlarmProfileSettings isAdmin={isAdmin} /> : <SystemConfigSettings isAdmin={isAdmin} />}
    </div>
  )
}

export default SettingsPage

type EntryEditState = {
  valueText: string
  valueBool: boolean
}

function encodeEntryValue(entry: { valueType: SystemConfigValueType; value: unknown }): EntryEditState {
  if (entry.valueType === 'boolean') return { valueText: '', valueBool: Boolean(entry.value) }
  if (entry.valueType === 'json') return { valueText: JSON.stringify(entry.value ?? null, null, 2), valueBool: false }
  return { valueText: String(entry.value ?? ''), valueBool: false }
}

function parseEntryValue(valueType: SystemConfigValueType, edit: EntryEditState): unknown {
  if (valueType === 'boolean') return edit.valueBool
  if (valueType === 'integer') return Number.parseInt(edit.valueText || '0', 10)
  if (valueType === 'float') return Number.parseFloat(edit.valueText || '0')
  if (valueType === 'string') return edit.valueText
  return JSON.parse(edit.valueText || 'null')
}

function EntriesTable({
  entries,
  edits,
  setEdits,
  disabled,
}: {
  entries: Array<{ key: string; name: string; valueType: SystemConfigValueType; value: unknown; description?: string }>
  edits: Record<string, EntryEditState>
  setEdits: React.Dispatch<React.SetStateAction<Record<string, EntryEditState>>>
  disabled: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Key</th>
            <th className="py-2 pr-4 font-medium">Type</th>
            <th className="py-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const edit = edits[entry.key] ?? encodeEntryValue(entry)
            return (
              <tr key={entry.key} className="border-b last:border-b-0 align-top">
                <td className="py-3 pr-4">
                  <div className="font-medium">{entry.name}</div>
                  {entry.description ? <div className="text-xs text-muted-foreground">{entry.description}</div> : null}
                </td>
                <td className="py-3 pr-4 font-mono text-xs">{entry.key}</td>
                <td className="py-3 pr-4">{entry.valueType}</td>
                <td className="py-2">
                  {entry.valueType === 'boolean' ? (
                    <Switch
                      checked={edit.valueBool}
                      onCheckedChange={(checked) =>
                        setEdits((prev) => ({ ...prev, [entry.key]: { ...edit, valueBool: checked } }))
                      }
                      disabled={disabled}
                    />
                  ) : entry.valueType === 'json' ? (
                    <Textarea
                      value={edit.valueText}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [entry.key]: { ...edit, valueText: e.target.value } }))}
                      className="min-h-24 font-mono text-xs"
                      disabled={disabled}
                    />
                  ) : (
                    <Input
                      type={entry.valueType === 'integer' || entry.valueType === 'float' ? 'number' : 'text'}
                      value={edit.valueText}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [entry.key]: { ...edit, valueText: e.target.value } }))}
                      disabled={disabled}
                    />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AlarmProfileSettings({ isAdmin }: { isAdmin: boolean }) {
  const profilesQuery = useSettingsProfilesQuery()
  const activeProfileQuery = useAlarmSettingsQuery()

  const profiles: AlarmSettingsProfileMeta[] = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data])

  const activeProfileId = activeProfileQuery.data?.id ?? null
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null)

  useEffect(() => {
    if (selectedProfileId) return
    if (activeProfileId) setSelectedProfileId(activeProfileId)
  }, [activeProfileId, selectedProfileId])

  const selectedProfileQuery = useSettingsProfileDetailQuery(selectedProfileId)
  const selectedProfile: AlarmSettingsProfileDetail | null = selectedProfileQuery.data ?? null

  const updateMutation = useUpdateSettingsProfileMutation()
  const createMutation = useCreateSettingsProfileMutation()
  const deleteMutation = useDeleteSettingsProfileMutation()
  const activateMutation = useActivateSettingsProfileMutation()

  const [createName, setCreateName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, EntryEditState>>({})

  const buildEdits = (entries: AlarmSettingEntry[]) => {
    const next: Record<string, EntryEditState> = {}
    for (const entry of entries) next[entry.key] = encodeEntryValue(entry)
    return next
  }

  useEffect(() => {
    if (!selectedProfile) return
    setEdits(buildEdits(selectedProfile.entries))
    setError(null)
    setNotice(null)
  }, [selectedProfile])

  const isLoading =
    profilesQuery.isLoading ||
    activeProfileQuery.isLoading ||
    selectedProfileQuery.isLoading ||
    currentIsPending([updateMutation, createMutation, deleteMutation, activateMutation])

  const activeLabel = (p: AlarmSettingsProfileMeta) => `${p.name}${p.isActive ? ' (active)' : ''}`

  const save = async () => {
    setError(null)
    setNotice(null)
    if (!selectedProfileId || !selectedProfile) return
    try {
      const entries = selectedProfile.entries.map((entry) => ({
        key: entry.key,
        value: parseEntryValue(entry.valueType, edits[entry.key] ?? encodeEntryValue(entry)),
      }))
      await updateMutation.mutateAsync({ id: selectedProfileId, changes: { entries } })
      setNotice('Saved.')
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to save settings')
    }
  }

  const activateSelected = async () => {
    setError(null)
    setNotice(null)
    if (!selectedProfileId) return
    try {
      await activateMutation.mutateAsync(selectedProfileId)
      setNotice('Activated.')
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to activate profile')
    }
  }

  const deleteSelected = async () => {
    setError(null)
    setNotice(null)
    if (!selectedProfileId) return
    if (!confirm('Delete this profile?')) return
    try {
      await deleteMutation.mutateAsync(selectedProfileId)
      setSelectedProfileId(activeProfileId)
      setNotice('Deleted.')
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to delete profile')
    }
  }

  const createProfile = async () => {
    setError(null)
    setNotice(null)
    const name = createName.trim()
    if (!name) {
      setError('Profile name is required.')
      return
    }
    try {
      const created = await createMutation.mutateAsync({ name })
      setCreateName('')
      setSelectedProfileId(created.id)
      setNotice('Created.')
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to create profile')
    }
  }

  const readOnly = !isAdmin

  const profileError = getErrorMessage(profilesQuery.error) || getErrorMessage(selectedProfileQuery.error) || getErrorMessage(activeProfileQuery.error) || null

  return (
    <div className="space-y-6">
      <SectionCard title="Profiles" description="Select a profile to view/edit; activate to apply system-wide.">
        {profileError ? (
          <Alert variant="destructive">
            <AlertDescription>{profileError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Selected profile" htmlFor="settings-profile">
            <Select
              id="settings-profile"
              value={selectedProfileId ? String(selectedProfileId) : ''}
              onChange={(e) => setSelectedProfileId(e.target.value ? Number(e.target.value) : null)}
              disabled={profilesQuery.isLoading}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {activeLabel(p)}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Active profile">
            <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
              {activeProfileQuery.data ? activeLabel(activeProfileQuery.data) : '—'}
            </div>
          </FormField>
        </div>

        {isAdmin ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => profilesQuery.refetch()} disabled={isLoading}>
              Refresh
            </Button>
            <Button type="button" onClick={activateSelected} disabled={isLoading || !selectedProfileId}>
              Activate selected
            </Button>
            <Button type="button" variant="destructive" onClick={deleteSelected} disabled={isLoading || !selectedProfileId}>
              Delete selected
            </Button>
          </div>
        ) : (
          <div className="mt-4 text-sm text-muted-foreground">Admin role required to modify profiles.</div>
        )}
      </SectionCard>

      {isAdmin ? (
        <SectionCard title="Create profile" description="Creates a new (inactive) profile with sensible defaults.">
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <FormField label="Name" htmlFor="create-profile-name">
              <Input
                id="create-profile-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Default"
                disabled={isLoading}
              />
            </FormField>
            <div className="flex items-end">
              <Button type="button" onClick={createProfile} disabled={isLoading}>
                Create
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Profile settings"
        description={selectedProfile?.profile.isActive ? 'This profile is currently active.' : 'Edit settings, then save.'}
        actions={
          isAdmin ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => selectedProfileId && selectedProfileQuery.refetch()}
                disabled={isLoading}
              >
                Reset
              </Button>
              <Button type="button" onClick={save} disabled={isLoading || readOnly || !selectedProfile}>
                Save
              </Button>
            </div>
          ) : null
        }
      >
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : notice ? (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        {selectedProfileQuery.isLoading ? (
          <div className="py-6">
            <LoadingInline message="Loading profile…" />
          </div>
        ) : !selectedProfile ? (
          <EmptyState title="No profile selected" description="Select a profile to view settings." />
        ) : (
          <EntriesTable
            entries={selectedProfile.entries}
            edits={edits}
            setEdits={setEdits}
            disabled={readOnly || isLoading}
          />
        )}
      </SectionCard>
    </div>
  )
}

function currentIsPending(mutations: Array<{ isPending?: boolean }>): boolean {
  return mutations.some((m) => !!m.isPending)
}

function SystemConfigSettings({ isAdmin }: { isAdmin: boolean }) {
  const systemConfigQuery = useSystemConfigQuery()
  const updateMutation = useUpdateSystemConfigMutation()

  const rows: SystemConfigRow[] = useMemo(() => systemConfigQuery.data ?? [], [systemConfigQuery.data])

  const [edits, setEdits] = useState<Record<string, EntryEditState>>({})

  useEffect(() => {
    const next: Record<string, EntryEditState> = {}
    for (const row of rows) {
      next[row.key] = encodeEntryValue(row)
    }
    setEdits(next)
  }, [rows])

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const isLoading = systemConfigQuery.isLoading || currentIsPending([updateMutation])

  const saveRow = async (row: SystemConfigRow) => {
    setError(null)
    setNotice(null)
    if (!isAdmin) return
    try {
      const edit = edits[row.key]
      if (!edit) return
      const value = parseEntryValue(row.valueType, edit)
      await updateMutation.mutateAsync({ key: row.key, changes: { value } })
      setNotice('Saved.')
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to save setting')
    }
  }

  const systemError = getErrorMessage(systemConfigQuery.error) || null

  return (
    <div className="space-y-6">
      <SectionCard title="System config" description="Key/value settings stored as rows (admin-only).">
        {!isAdmin ? (
          <Alert>
            <AlertDescription>Admin role required.</AlertDescription>
          </Alert>
        ) : null}

        {systemError ? (
          <Alert variant="destructive">
            <AlertDescription>{systemError}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : notice ? (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        {systemConfigQuery.isLoading ? (
          <div className="py-6">
            <LoadingInline message="Loading system config…" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => systemConfigQuery.refetch()} disabled={!isAdmin || isLoading}>
                Refresh
              </Button>
            </div>

            {rows.length === 0 ? (
              <EmptyState title="No system config rows" description="Create a row below." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Name</th>
                      <th className="py-2 pr-4 font-medium">Key</th>
                      <th className="py-2 pr-4 font-medium">Type</th>
                      <th className="py-2 pr-4 font-medium">Value</th>
                      <th className="py-2 pr-4 font-medium">Description</th>
                      <th className="py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const edit = edits[row.key]
                      const disabled = !isAdmin || isLoading
                      return (
                        <tr key={row.key} className="border-b last:border-b-0 align-top">
                          <td className="py-3 pr-4">
                            <div className="font-medium">{row.name}</div>
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs">{row.key}</td>
                          <td className="py-3 pr-4">{row.valueType}</td>
                          <td className="py-2 pr-4">
                            {row.valueType === 'boolean' ? (
                              <Switch
                                checked={edit?.valueBool ?? Boolean(row.value)}
                                onCheckedChange={(checked) =>
                                  setEdits((prev) => ({ ...prev, [row.key]: { ...(prev[row.key] || edit!), valueBool: checked } }))
                                }
                                disabled={disabled}
                              />
                            ) : row.valueType === 'json' ? (
                              <Textarea
                                value={edit?.valueText ?? JSON.stringify(row.value ?? null, null, 2)}
                                onChange={(e) =>
                                  setEdits((prev) => ({ ...prev, [row.key]: { ...(prev[row.key] || edit!), valueText: e.target.value } }))
                                }
                                className="min-h-24 font-mono text-xs"
                                disabled={disabled}
                              />
                            ) : (
                              <Input
                                value={edit?.valueText ?? String(row.value ?? '')}
                                onChange={(e) =>
                                  setEdits((prev) => ({ ...prev, [row.key]: { ...(prev[row.key] || edit!), valueText: e.target.value } }))
                                }
                                disabled={disabled}
                              />
                            )}
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">{row.description || '—'}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <Button type="button" variant="secondary" onClick={() => saveRow(row)} disabled={disabled}>
                                Save
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}
      </SectionCard>
    </div>
  )
}
