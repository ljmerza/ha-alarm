import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Home,
  Moon,
  Plane,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { AlarmState, AlarmStateLabels, type AlarmStateType } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface AlarmStatusProps {
  state: AlarmStateType
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showLabel?: boolean
  animate?: boolean
}

const stateConfig: Record<
  AlarmStateType,
  {
    icon: React.ElementType
    bgColor: string
    textColor: string
    borderColor: string
    pulseColor?: string
  }
> = {
  [AlarmState.DISARMED]: {
    icon: ShieldOff,
    bgColor: 'bg-green-500',
    textColor: 'text-green-500',
    borderColor: 'border-green-500',
  },
  [AlarmState.ARMING]: {
    icon: Clock,
    bgColor: 'bg-amber-500',
    textColor: 'text-amber-500',
    borderColor: 'border-amber-500',
    pulseColor: 'bg-amber-400',
  },
  [AlarmState.ARMED_HOME]: {
    icon: Home,
    bgColor: 'bg-yellow-500',
    textColor: 'text-yellow-500',
    borderColor: 'border-yellow-500',
  },
  [AlarmState.ARMED_AWAY]: {
    icon: ShieldCheck,
    bgColor: 'bg-red-500',
    textColor: 'text-red-500',
    borderColor: 'border-red-500',
  },
  [AlarmState.ARMED_NIGHT]: {
    icon: Moon,
    bgColor: 'bg-purple-500',
    textColor: 'text-purple-500',
    borderColor: 'border-purple-500',
  },
  [AlarmState.ARMED_VACATION]: {
    icon: Plane,
    bgColor: 'bg-blue-500',
    textColor: 'text-blue-500',
    borderColor: 'border-blue-500',
  },
  [AlarmState.ARMED_CUSTOM_BYPASS]: {
    icon: ShieldCheck,
    bgColor: 'bg-slate-500',
    textColor: 'text-slate-500',
    borderColor: 'border-slate-500',
  },
  [AlarmState.PENDING]: {
    icon: AlertTriangle,
    bgColor: 'bg-orange-500',
    textColor: 'text-orange-500',
    borderColor: 'border-orange-500',
    pulseColor: 'bg-orange-400',
  },
  [AlarmState.TRIGGERED]: {
    icon: ShieldAlert,
    bgColor: 'bg-red-600',
    textColor: 'text-red-600',
    borderColor: 'border-red-600',
    pulseColor: 'bg-red-500',
  },
}

const sizeClasses = {
  sm: 'h-12 w-12',
  md: 'h-16 w-16',
  lg: 'h-24 w-24',
  xl: 'h-32 w-32',
}

const iconSizes = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
}

const labelSizes = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-2xl',
}

export function AlarmStatus({
  state,
  className,
  size = 'lg',
  showLabel = true,
  animate = true,
}: AlarmStatusProps) {
  const config = stateConfig[state]
  const Icon = config.icon
  const shouldPulse = animate && config.pulseColor

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      {/* Status Circle */}
      <div className="relative">
        {/* Pulse animation for certain states */}
        {shouldPulse && (
          <div
            className={cn(
              'absolute inset-0 rounded-full animate-ping opacity-75',
              config.pulseColor,
              sizeClasses[size]
            )}
          />
        )}
        <div
          className={cn(
            'relative flex items-center justify-center rounded-full text-white',
            config.bgColor,
            sizeClasses[size],
            shouldPulse && 'animate-pulse'
          )}
        >
          <Icon className={iconSizes[size]} />
        </div>
      </div>

      {/* Label */}
      {showLabel && (
        <div className="text-center">
          <p className={cn('font-bold', labelSizes[size], config.textColor)}>
            {AlarmStateLabels[state]}
          </p>
        </div>
      )}
    </div>
  )
}

export default AlarmStatus
