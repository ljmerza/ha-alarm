import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { api } from '@/services/api'
import { Routes } from '@/lib/constants'
import { useSetupStore } from '@/stores'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const schema = z.object({
  label: z.string().max(150).optional(),
  code: z
    .string()
    .regex(/^\d+$/, 'Code must be digits only')
    .min(4, 'Code must be 4–8 digits')
    .max(8, 'Code must be 4–8 digits'),
})

type FormData = z.infer<typeof schema>

export function SetupWizardPage() {
  const navigate = useNavigate()
  const { checkStatus } = useSetupStore()
  const [error, setError] = useState<string | null>(null)

  const defaultValues = useMemo<FormData>(() => ({ label: 'Admin', code: '' }), [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues })

  const onSubmit = async (data: FormData) => {
    setError(null)
    try {
      await api.post('/api/codes/', { code: data.code, label: data.label || '' })
      await checkStatus()
      navigate(Routes.HOME, { replace: true })
    } catch (err) {
      if (err && typeof err === 'object') {
        const anyErr = err as { message?: string; detail?: string }
        setError(anyErr.detail || anyErr.message || 'Failed to create code')
      } else {
        setError('Failed to create code')
      }
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Create an Alarm Code</CardTitle>
          <CardDescription>
            You need at least one code to arm and disarm.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="label" className="text-sm font-medium">
                Label (optional)
              </label>
              <Input id="label" type="text" placeholder="Admin" {...register('label')} disabled={isSubmitting} />
              {errors.label && <p className="text-sm text-destructive">{errors.label.message}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium">
                Code
              </label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="4–8 digits"
                {...register('code')}
                disabled={isSubmitting}
              />
              {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save Code'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default SetupWizardPage

