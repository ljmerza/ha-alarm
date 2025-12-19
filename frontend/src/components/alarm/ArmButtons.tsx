import { Home, Shield, Moon, Plane } from 'lucide-react'
import { AlarmState, type AlarmStateType } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ArmButtonsProps {
  onArm: (state: AlarmStateType) => void
  availableStates?: AlarmStateType[]
  currentState: AlarmStateType
  disabled?: boolean
  className?: string
}

const armStateConfig: Record<
  string,
  {
    icon: React.ElementType
    label: string
    color: string
    hoverColor: string
  }
> = {
  [AlarmState.ARMED_HOME]: {
    icon: Home,
    label: 'Home',
    color: 'bg-yellow-500 hover:bg-yellow-600',
    hoverColor: 'hover:bg-yellow-600',
  },
  [AlarmState.ARMED_AWAY]: {
    icon: Shield,
    label: 'Away',
    color: 'bg-red-500 hover:bg-red-600',
    hoverColor: 'hover:bg-red-600',
  },
  [AlarmState.ARMED_NIGHT]: {
    icon: Moon,
    label: 'Night',
    color: 'bg-purple-500 hover:bg-purple-600',
    hoverColor: 'hover:bg-purple-600',
  },
  [AlarmState.ARMED_VACATION]: {
    icon: Plane,
    label: 'Vacation',
    color: 'bg-blue-500 hover:bg-blue-600',
    hoverColor: 'hover:bg-blue-600',
  },
}

export function ArmButtons({
  onArm,
  availableStates = [
    AlarmState.ARMED_HOME,
    AlarmState.ARMED_AWAY,
    AlarmState.ARMED_NIGHT,
    AlarmState.ARMED_VACATION,
  ],
  currentState,
  disabled = false,
  className,
}: ArmButtonsProps) {

  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      {availableStates.map((state) => {
        const config = armStateConfig[state]
        if (!config) return null

        const Icon = config.icon
        const isCurrentState = currentState === state

        return (
          <Button
            key={state}
            variant="default"
            className={cn(
              'h-20 flex-col gap-1 text-white',
              config.color,
              isCurrentState && 'ring-2 ring-offset-2 ring-offset-background',
              disabled && 'opacity-50'
            )}
            onClick={() => onArm(state)}
            disabled={disabled || isCurrentState}
          >
            <Icon className="h-6 w-6" />
            <span className="text-sm font-medium">{config.label}</span>
          </Button>
        )
      })}
    </div>
  )
}

export default ArmButtons
