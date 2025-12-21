import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Routes, AlarmState, AlarmStateLabels, UserRole } from '@/lib/constants'
import type { AlarmStateType } from '@/lib/constants'
import { getErrorMessage } from '@/lib/errors'
import { codesService } from '@/services'
import { useAuth } from '@/hooks/useAuth'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CenteredCard } from '@/components/ui/centered-card'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/form-field'

const ARMABLE_STATES: AlarmStateType[] = [
  AlarmState.ARMED_HOME,
  AlarmState.ARMED_AWAY,
  AlarmState.ARMED_NIGHT,
  AlarmState.ARMED_VACATION,
  AlarmState.ARMED_CUSTOM_BYPASS,
]

const schema = z.object({
  label: z.string().max(150).optional(),
  code: z
    .string()
    .regex(/^\d+$/, 'Code must be digits only')
    .min(4, 'Code must be 4–8 digits')
    .max(8, 'Code must be 4–8 digits'),
  reauthPassword: z.string().min(1, 'Password is required'),
})

type FormData = z.infer<typeof schema>

export function SetupWizardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [allowedStates, setAllowedStates] = useState<AlarmStateType[]>(ARMABLE_STATES)

  const defaultValues = useMemo<FormData>(() => ({ label: 'Admin', code: '', reauthPassword: '' }), [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues })

  const onSubmit = async (data: FormData) => {
    setError(null)
    try {
      if (!user) {
        setError('Not authenticated.')
        return
      }
      if (user.role !== UserRole.ADMIN) {
        setError('An admin must create your alarm code.')
        return
      }

      await codesService.createCode({
        userId: user.id,
        code: data.code,
        label: data.label || '',
        allowedStates,
        reauthPassword: data.reauthPassword,
      })
      await queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.setupStatus })
      navigate(Routes.HOME, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to create code')
    }
  }

  return (
    <CenteredCard
      layout="section"
      title="Create an Alarm Code"
      description="You need at least one code to arm and disarm."
      icon={<ShieldCheck className="h-6 w-6" />}
    >
      {user?.role !== UserRole.ADMIN ? (
        <div className="space-y-4">
          <Alert variant="warning" layout="banner">
            <AlertTitle>Admin action required</AlertTitle>
          <AlertDescription>
              An admin must create your alarm code before you can use the system.
            </AlertDescription>
          </Alert>
          <Button
            type="button"
            className="w-full"
            variant="secondary"
            onClick={() => logout()}
          >
            Log out
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label="Label (optional)"
            htmlFor="label"
            error={errors.label?.message}
          >
            <Input id="label" type="text" placeholder="Admin" {...register('label')} disabled={isSubmitting} />
          </FormField>

          <FormField label="Code" htmlFor="code" required error={errors.code?.message}>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="4–8 digits"
              {...register('code')}
              disabled={isSubmitting}
            />
          </FormField>

          <div className="space-y-2">
            <div className="text-sm font-medium">Allowed Arm States</div>
            <div className="grid gap-2">
              {ARMABLE_STATES.map((state) => (
                <label key={state} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={allowedStates.includes(state)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setAllowedStates((cur) => {
                        if (checked) return Array.from(new Set([...cur, state]))
                        return cur.filter((s) => s !== state)
                      })
                    }}
                    disabled={isSubmitting}
                  />
                  {AlarmStateLabels[state]}
                </label>
              ))}
            </div>
          </div>

          <FormField
            label="Re-authenticate (password)"
            htmlFor="reauthPassword"
            required
            error={errors.reauthPassword?.message}
          >
            <Input
              id="reauthPassword"
              type="password"
              placeholder="Your account password"
              {...register('reauthPassword')}
              disabled={isSubmitting}
            />
          </FormField>

          {error && (
            <Alert variant="error" layout="inline">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save Code'}
          </Button>
        </form>
      )}
    </CenteredCard>
  )
}

export default SetupWizardPage
