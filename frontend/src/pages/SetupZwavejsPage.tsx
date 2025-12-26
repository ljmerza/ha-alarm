import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radio } from 'lucide-react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Routes, UserRole } from '@/lib/constants'
import { getErrorMessage } from '@/lib/errors'
import { useAuth } from '@/hooks/useAuth'
import { useSyncZwavejsEntitiesMutation, useTestZwavejsConnectionMutation, useUpdateZwavejsSettingsMutation, useZwavejsSettingsQuery, useZwavejsStatusQuery } from '@/hooks/useZwavejs'
import { CenteredCard } from '@/components/ui/centered-card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'

const schema = z.object({
  enabled: z.boolean(),
  wsUrl: z
    .string()
    .trim()
    .min(1, 'WebSocket URL is required')
    .refine((value) => value.startsWith('ws://') || value.startsWith('wss://'), 'Must start with ws:// or wss://'),
  connectTimeoutSeconds: z.string().min(1, 'Connect timeout is required'),
  reconnectMinSeconds: z.string().min(1, 'Reconnect min is required'),
  reconnectMaxSeconds: z.string().min(1, 'Reconnect max is required'),
})

type FormData = z.infer<typeof schema>

export function SetupZwavejsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === UserRole.ADMIN
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const statusQuery = useZwavejsStatusQuery()
  const settingsQuery = useZwavejsSettingsQuery()
  const updateSettings = useUpdateZwavejsSettingsMutation()
  const testConnection = useTestZwavejsConnectionMutation()
  const syncEntities = useSyncZwavejsEntitiesMutation()

  const initialValues = useMemo<FormData | null>(() => {
    if (!settingsQuery.data) return null
    return {
      enabled: settingsQuery.data.enabled,
      wsUrl: settingsQuery.data.wsUrl || '',
      connectTimeoutSeconds: String(settingsQuery.data.connectTimeoutSeconds ?? 5),
      reconnectMinSeconds: String(settingsQuery.data.reconnectMinSeconds ?? 1),
      reconnectMaxSeconds: String(settingsQuery.data.reconnectMaxSeconds ?? 30),
    }
  }, [settingsQuery.data])

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
      setError('Admin role required to configure Z-Wave JS.')
      return
    }

    try {
      const connectTimeoutSeconds = parseFloatField('Connect timeout', data.connectTimeoutSeconds, 0.5, 30)
      const reconnectMinSeconds = parseIntField('Reconnect min', data.reconnectMinSeconds, 0, 300)
      const reconnectMaxSeconds = parseIntField('Reconnect max', data.reconnectMaxSeconds, 0, 300)
      if (reconnectMaxSeconds && reconnectMinSeconds && reconnectMaxSeconds < reconnectMinSeconds) {
        throw new Error('Reconnect max must be >= reconnect min.')
      }

      await updateSettings.mutateAsync({
        enabled: data.enabled,
        wsUrl: data.wsUrl.trim(),
        connectTimeoutSeconds,
        reconnectMinSeconds,
        reconnectMaxSeconds,
      })
      setNotice('Saved Z-Wave JS settings.')
      void statusQuery.refetch()
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to save Z-Wave JS settings')
    }
  }

  const doTest = async () => {
    setError(null)
    setNotice(null)
    const data = watch()
    try {
      const connectTimeoutSeconds = parseFloatField('Connect timeout', data.connectTimeoutSeconds, 0.5, 30)
      await testConnection.mutateAsync({
        wsUrl: data.wsUrl.trim(),
        connectTimeoutSeconds,
      })
      setNotice('Connection OK.')
    } catch (err) {
      setError(getErrorMessage(err) || 'Connection failed')
    }
  }

  const doSync = async () => {
    setError(null)
    setNotice(null)
    try {
      const res = await syncEntities.mutateAsync()
      setNotice(res.notice)
    } catch (err) {
      setError(getErrorMessage(err) || 'Entity sync failed')
    }
  }

  return (
    <CenteredCard
      layout="section"
      title="Z-Wave JS"
      description="Connect to Z-Wave JS UI / zwave-js-server via WebSocket."
      icon={<Radio className="h-6 w-6" />}
    >
      {!isAdmin ? (
        <Alert variant="warning" layout="inline">
          <AlertTitle>Admin action required</AlertTitle>
          <AlertDescription>An admin must configure Z-Wave JS integration.</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2 text-sm">
        <div>
          Status:{' '}
          {statusQuery.data?.connected ? (
            <span className="font-medium text-emerald-600">Connected</span>
          ) : statusQuery.data?.enabled ? (
            <span className="font-medium text-amber-600">Disconnected</span>
          ) : (
            <span className="font-medium text-muted-foreground">Disabled</span>
          )}
        </div>
        {statusQuery.data?.lastError ? <div className="text-muted-foreground">Last error: {statusQuery.data.lastError}</div> : null}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-medium">Enable Z-Wave JS integration</div>
          <Switch checked={enabled} onCheckedChange={(checked) => setValue('enabled', checked)} disabled={!isAdmin || isSubmitting} />
        </div>

        <FormField label="WebSocket URL" htmlFor="wsUrl" required error={errors.wsUrl?.message}>
          <Input id="wsUrl" placeholder="ws://192.168.1.186:8192" {...register('wsUrl')} disabled={!isAdmin || isSubmitting} />
          <div className="mt-1 text-xs text-muted-foreground">
            Z-Wave JS UI uses the WS port (your mapping shows 8192).
          </div>
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Connect timeout (s)" htmlFor="connectTimeoutSeconds" required error={errors.connectTimeoutSeconds?.message}>
            <Input id="connectTimeoutSeconds" inputMode="decimal" {...register('connectTimeoutSeconds')} disabled={!isAdmin || isSubmitting} />
          </FormField>
          <FormField label="Reconnect min (s)" htmlFor="reconnectMinSeconds" required error={errors.reconnectMinSeconds?.message}>
            <Input id="reconnectMinSeconds" inputMode="numeric" {...register('reconnectMinSeconds')} disabled={!isAdmin || isSubmitting} />
          </FormField>
          <FormField label="Reconnect max (s)" htmlFor="reconnectMaxSeconds" required error={errors.reconnectMaxSeconds?.message}>
            <Input id="reconnectMaxSeconds" inputMode="numeric" {...register('reconnectMaxSeconds')} disabled={!isAdmin || isSubmitting} />
          </FormField>
        </div>

        {error ? (
          <Alert variant="error" layout="inline">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : notice ? (
          <Alert layout="inline">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="flex-1" disabled={!isAdmin || isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="secondary" className="flex-1" onClick={() => void doTest()} disabled={!isAdmin || isSubmitting}>
            Test Connection
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={() => void doSync()} disabled={!isAdmin || isSubmitting}>
            Sync Entities
          </Button>
        </div>

        <Button type="button" className="w-full" variant="ghost" onClick={() => navigate(Routes.HOME, { replace: true })}>
          Back to dashboard
        </Button>
      </form>
    </CenteredCard>
  )
}

export default SetupZwavejsPage
