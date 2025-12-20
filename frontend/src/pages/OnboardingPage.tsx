import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { onboardingService } from '@/services'
import { useOnboardingStore } from '@/stores'
import { Routes } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const onboardingSchema = z.object({
  homeName: z.string().min(2, 'Home name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type OnboardingForm = z.infer<typeof onboardingSchema>

export function OnboardingPage() {
  const navigate = useNavigate()
  const { setOnboardingRequired } = useOnboardingStore()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
  })

  const onSubmit = async (data: OnboardingForm) => {
    setError(null)
    setIsSubmitting(true)
    try {
      await onboardingService.create({
        email: data.email,
        password: data.password,
        homeName: data.homeName,
      })
      setOnboardingRequired(false)
      navigate(Routes.LOGIN)
    } catch (err) {
      if (err && typeof err === 'object') {
        const anyErr = err as { message?: string; detail?: string }
        setError(anyErr.detail || anyErr.message || 'Onboarding failed')
      } else {
        setError('Onboarding failed')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Set Up Your Alarm</CardTitle>
          <CardDescription>Create the first admin to get started.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="homeName" className="text-sm font-medium">
                Home name
              </label>
              <Input
                id="homeName"
                type="text"
                placeholder="Primary Residence"
                {...register('homeName')}
                disabled={isSubmitting}
              />
              {errors.homeName && (
                <p className="text-sm text-destructive">{errors.homeName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Admin email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                {...register('email')}
                disabled={isSubmitting}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Admin password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  {...register('password')}
                  disabled={isSubmitting}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Setting up...' : 'Create Admin'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default OnboardingPage
