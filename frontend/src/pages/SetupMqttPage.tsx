import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wifi } from 'lucide-react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Routes, UserRole } from '@/lib/constants'
import { getErrorMessage } from '@/lib/errors'
import { useAuth } from '@/hooks/useAuth'
import { useMqttAlarmEntityQuery, useMqttSettingsQuery, useMqttStatusQuery, usePublishMqttDiscoveryMutation, useTestMqttConnectionMutation, useUpdateMqttAlarmEntityMutation, useUpdateMqttSettingsMutation } from '@/hooks/useMqtt'
import { CenteredCard } from '@/components/ui/centered-card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'

const schema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().optional(),
  port: z.string().min(1, 'Port is required'),
  username: z.string().optional(),
  password: z.string().optional(),
  useTls: z.boolean(),
  tlsInsecure: z.boolean(),
  clientId: z.string().optional(),
  keepaliveSeconds: z.string().min(1, 'Keepalive is required'),
  connectTimeoutSeconds: z.string().min(1, 'Connect timeout is required'),
  alarmEntityEnabled: z.boolean(),
  alarmEntityName: z.string().min(1, 'Name is required'),
  alsoRenameInHomeAssistant: z.boolean(),
})

type FormData = z.infer<typeof schema>

export function SetupMqttPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === UserRole.ADMIN
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const statusQuery = useMqttStatusQuery()
  const settingsQuery = useMqttSettingsQuery()
  const entityQuery = useMqttAlarmEntityQuery()

  const updateSettings = useUpdateMqttSettingsMutation()
  const updateEntity = useUpdateMqttAlarmEntityMutation()
  const testConnection = useTestMqttConnectionMutation()
  const publishDiscovery = usePublishMqttDiscoveryMutation()

  const initialValues = useMemo<FormData | null>(() => {
    if (!settingsQuery.data || !entityQuery.data) return null
    return {
      enabled: settingsQuery.data.enabled,
      host: settingsQuery.data.host || '',
      port: String(settingsQuery.data.port ?? 1883),
      username: settingsQuery.data.username || '',
      password: '',
      useTls: settingsQuery.data.useTls,
      tlsInsecure: settingsQuery.data.tlsInsecure,
      clientId: settingsQuery.data.clientId || 'cubxi-alarm',
      keepaliveSeconds: String(settingsQuery.data.keepaliveSeconds ?? 30),
      connectTimeoutSeconds: String(settingsQuery.data.connectTimeoutSeconds ?? 5),
      alarmEntityEnabled: entityQuery.data.enabled,
      alarmEntityName: entityQuery.data.entityName || 'Home Alarm',
      alsoRenameInHomeAssistant: entityQuery.data.alsoRenameInHomeAssistant ?? true,
    }
  }, [entityQuery.data, settingsQuery.data])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: initialValues ?? undefined,
  })

  useEffect(() => {
    if (!initialValues) return
    reset(initialValues)
  }, [initialValues, reset])

  const enabled = watch('enabled')

  const parseIntField = (label: string, value: string, min: number, max: number) => {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) throw new Error(`${label} must be a number.`)
    if (parsed < min || parsed > max) throw new Error(`${label} must be between ${min} and ${max}.`)
    return parsed
  }

  const parseFloatField = (label: string, value: string, min: number, max: number) => {
    const parsed = Number.parseFloat(value)
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) throw new Error(`${label} must be a number.`)
    if (parsed < min || parsed > max) throw new Error(`${label} must be between ${min} and ${max}.`)
    return parsed
  }

  const onSubmit = async (data: FormData) => {
    setError(null)
    setNotice(null)
    if (!isAdmin) {
      setError('Admin role required to configure MQTT.')
      return
    }
    try {
      const port = parseIntField('Port', data.port, 1, 65535)
      const keepaliveSeconds = parseIntField('Keepalive', data.keepaliveSeconds, 5, 3600)
      const connectTimeoutSeconds = parseFloatField('Connect timeout', data.connectTimeoutSeconds, 0.5, 30)
      await updateSettings.mutateAsync({
        enabled: data.enabled,
        host: data.host?.trim() || '',
        port,
        username: data.username?.trim() || '',
        ...(data.password?.trim() ? { password: data.password } : {}),
        useTls: data.useTls,
        tlsInsecure: data.tlsInsecure,
        clientId: data.clientId?.trim() || 'cubxi-alarm',
        keepaliveSeconds,
        connectTimeoutSeconds,
      })
      await updateEntity.mutateAsync({
        enabled: data.alarmEntityEnabled,
        entityName: data.alarmEntityName.trim(),
        alsoRenameInHomeAssistant: data.alsoRenameInHomeAssistant,
      })
      setValue('password', '')
      setNotice('Saved MQTT settings.')
      void statusQuery.refetch()
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to save MQTT settings')
    }
  }

  const doTest = async () => {
    setError(null)
    setNotice(null)
    const data = watch()
    try {
      const port = parseIntField('Port', data.port, 1, 65535)
      const keepaliveSeconds = parseIntField('Keepalive', data.keepaliveSeconds, 5, 3600)
      const connectTimeoutSeconds = parseFloatField('Connect timeout', data.connectTimeoutSeconds, 0.5, 30)
      await testConnection.mutateAsync({
        host: data.host?.trim() || '',
        port,
        username: data.username?.trim() || '',
        password: data.password?.trim() || undefined,
        useTls: data.useTls,
        tlsInsecure: data.tlsInsecure,
        clientId: data.clientId?.trim() || 'cubxi-alarm',
        keepaliveSeconds,
        connectTimeoutSeconds,
      })
      setNotice('Connection OK.')
    } catch (err) {
      setError(getErrorMessage(err) || 'Connection failed')
    }
  }

  const doPublish = async () => {
    setError(null)
    setNotice(null)
    try {
      await publishDiscovery.mutateAsync()
      setNotice('Published Home Assistant discovery config.')
      void statusQuery.refetch()
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to publish discovery config')
    }
  }

  return (
    <CenteredCard
      layout="section"
      title="Home Assistant (MQTT)"
      description="Connect to an MQTT broker and create the Home Assistant alarm entity."
      icon={<Wifi className="h-6 w-6" />}
    >
      {!isAdmin ? (
        <Alert variant="warning" layout="inline">
          <AlertTitle>Admin action required</AlertTitle>
          <AlertDescription>An admin must configure MQTT integration.</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2 text-sm">
        <div>
          Status:{' '}
          {statusQuery.data?.connected ? (
            <span className="font-medium text-emerald-600">Connected</span>
          ) : (
            <span className="font-medium text-muted-foreground">Disconnected</span>
          )}
        </div>
        {statusQuery.data?.lastError ? (
          <div className="text-muted-foreground">Last error: {statusQuery.data.lastError}</div>
        ) : null}
        {statusQuery.data?.alarmEntity?.enabled ? (
          <div className="text-muted-foreground">
            Entity: {statusQuery.data.alarmEntity.haEntityId || '—'} •{' '}
            {statusQuery.data.alarmEntity.lastStatePublishAt ? 'Syncing' : 'Not synced yet'}
            {statusQuery.data.alarmEntity.lastDiscoveryPublishAt ? (
              <span>
                {' '}
                • Last discovery: {new Date(statusQuery.data.alarmEntity.lastDiscoveryPublishAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-medium">Enable MQTT integration</div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => setValue('enabled', checked)}
            disabled={!isAdmin || isSubmitting}
          />
        </div>

        <FormField label="Broker host" htmlFor="host" required>
          <Input id="host" placeholder="mqtt.local" {...register('host')} disabled={!isAdmin || isSubmitting} />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Port" htmlFor="port" required error={errors.port?.message}>
            <Input id="port" inputMode="numeric" {...register('port')} disabled={!isAdmin || isSubmitting} />
          </FormField>

          <FormField label="Client ID" htmlFor="clientId" required error={errors.clientId?.message}>
            <Input id="clientId" placeholder="cubxi-alarm" {...register('clientId')} disabled={!isAdmin || isSubmitting} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Username" htmlFor="username">
            <Input id="username" {...register('username')} disabled={!isAdmin || isSubmitting} />
          </FormField>

          <FormField label="Password" htmlFor="password">
            <Input id="password" type="password" {...register('password')} disabled={!isAdmin || isSubmitting} />
            {settingsQuery.data?.hasPassword && !watch('password') ? (
              <div className="mt-1 text-xs text-muted-foreground">Password is saved (not shown). Leave blank to keep it.</div>
            ) : null}
          </FormField>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            checked={watch('useTls')}
            onChange={(e) => setValue('useTls', e.target.checked)}
            disabled={!isAdmin || isSubmitting}
          />
          <span className="text-sm">Use TLS</span>
        </div>

        {watch('useTls') ? (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={watch('tlsInsecure')}
              onChange={(e) => setValue('tlsInsecure', e.target.checked)}
              disabled={!isAdmin || isSubmitting}
            />
            <span className="text-sm">Allow insecure TLS (skip cert verification)</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Keepalive (seconds)" htmlFor="keepaliveSeconds" required error={errors.keepaliveSeconds?.message}>
            <Input
              id="keepaliveSeconds"
              inputMode="numeric"
              {...register('keepaliveSeconds')}
              disabled={!isAdmin || isSubmitting}
            />
          </FormField>
          <FormField
            label="Connect timeout (seconds)"
            htmlFor="connectTimeoutSeconds"
            required
            error={errors.connectTimeoutSeconds?.message}
          >
            <Input
              id="connectTimeoutSeconds"
              inputMode="decimal"
              {...register('connectTimeoutSeconds')}
              disabled={!isAdmin || isSubmitting}
            />
          </FormField>
        </div>

        <hr className="border-border" />

        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-medium">Create Home Assistant alarm entity</div>
          <Switch
            checked={watch('alarmEntityEnabled')}
            onCheckedChange={(checked) => setValue('alarmEntityEnabled', checked)}
            disabled={!isAdmin || isSubmitting}
          />
        </div>

        <FormField label="Entity name" htmlFor="alarmEntityName" required error={errors.alarmEntityName?.message}>
          <Input
            id="alarmEntityName"
            placeholder="Home Alarm"
            {...register('alarmEntityName')}
            disabled={!isAdmin || isSubmitting || !watch('alarmEntityEnabled')}
          />
        </FormField>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={watch('alsoRenameInHomeAssistant')}
            onChange={(e) => setValue('alsoRenameInHomeAssistant', e.target.checked)}
            disabled={!isAdmin || isSubmitting || !watch('alarmEntityEnabled')}
          />
          Also rename in Home Assistant (republish discovery config)
        </label>

        {error ? (
          <Alert variant="error" layout="inline">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {notice ? (
          <Alert variant="success" layout="inline">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="w-full" disabled={!isAdmin || isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
          <Button
            type="button"
            className="w-full"
            variant="outline"
            onClick={() => void doTest()}
            disabled={!isAdmin || isSubmitting || testConnection.isPending}
          >
            {testConnection.isPending ? 'Testing…' : 'Test Connection'}
          </Button>
          <Button
            type="button"
            className="w-full"
            variant="secondary"
            onClick={() => void doPublish()}
            disabled={!isAdmin || isSubmitting || publishDiscovery.isPending}
          >
            {publishDiscovery.isPending ? 'Publishing…' : 'Publish Discovery'}
          </Button>
        </div>

        <Button type="button" className="w-full" variant="ghost" onClick={() => navigate(Routes.HOME, { replace: true })}>
          Skip for now
        </Button>
      </form>
    </CenteredCard>
  )
}

export default SetupMqttPage
