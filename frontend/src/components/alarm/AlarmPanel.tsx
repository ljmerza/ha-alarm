import { useState, useCallback } from 'react'
import { useAlarm } from '@/hooks'
import { type AlarmStateType } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlarmStatus } from './AlarmStatus'
import { ArmButtons } from './ArmButtons'
import { Keypad } from './Keypad'
import { CountdownTimer } from './CountdownTimer'
import { QuickActions } from './QuickActions'
import { AlarmHistory } from './AlarmHistory'

// We need to create a simple Dialog component since we haven't added it yet
// For now, let's create an inline version

interface AlarmPanelProps {
  className?: string
}

type PanelMode = 'idle' | 'arming' | 'disarming'

export function AlarmPanel({ className }: AlarmPanelProps) {
  const {
    currentState,
    countdown,
    recentEvents,
    isLoading,
    error,
    isArmed,
    isDisarmed,
    isArming,
    isPending,
    isTriggered,
    codeRequiredForArm,
    availableArmingStates,
    arm,
    disarm,
    cancelArming,
    clearError,
  } = useAlarm()

  const [mode, setMode] = useState<PanelMode>('idle')
  const [pendingArmState, setPendingArmState] = useState<AlarmStateType | null>(null)
  const [showKeypad, setShowKeypad] = useState(false)

  // Handle arm button click
  const handleArmClick = useCallback(
    (targetState: AlarmStateType) => {
      if (codeRequiredForArm) {
        setPendingArmState(targetState)
        setMode('arming')
        setShowKeypad(true)
      } else {
        arm(targetState)
      }
    },
    [codeRequiredForArm, arm]
  )

  // Handle disarm button click
  const handleDisarmClick = useCallback(() => {
    setMode('disarming')
    setShowKeypad(true)
  }, [])

  // Handle code submission
  const handleCodeSubmit = useCallback(
    async (code: string) => {
      try {
        if (mode === 'arming' && pendingArmState) {
          await arm(pendingArmState, code)
        } else if (mode === 'disarming') {
          await disarm(code)
        }
        setShowKeypad(false)
        setMode('idle')
        setPendingArmState(null)
      } catch {
        // Error is handled by the store
      }
    },
    [mode, pendingArmState, arm, disarm]
  )

  // Handle cancel
  const handleCancel = useCallback(() => {
    setShowKeypad(false)
    setMode('idle')
    setPendingArmState(null)
    clearError()
  }, [clearError])

  // Handle cancel arming during exit delay
  const handleCancelArming = useCallback(async () => {
    try {
      await cancelArming()
    } catch {
      // Error is handled by the store
    }
  }, [cancelArming])

  return (
    <div className={cn('space-y-6', className)}>
      {/* Main Status Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center">
            {/* Countdown Timer (if active) */}
            {countdown && (isArming || isPending || isTriggered) && (
              <div className="w-full mb-6">
                <CountdownTimer
                  remainingSeconds={countdown.remainingSeconds}
                  totalSeconds={countdown.totalSeconds}
                  type={countdown.type}
                />
              </div>
            )}

            {/* Alarm Status */}
            {!countdown && (
              <AlarmStatus state={currentState} size="xl" animate={isTriggered} />
            )}

            {/* Action Buttons based on state */}
            <div className="w-full mt-6">
              {isDisarmed && (
                <ArmButtons
                  onArm={handleArmClick}
                  availableStates={availableArmingStates}
                  currentState={currentState}
                  disabled={isLoading}
                />
              )}

              {isArming && (
                <QuickActions
                  onDisarm={handleDisarmClick}
                  onCancel={handleCancelArming}
                  showCancel={true}
                  showDisarm={true}
                  showPanic={false}
                  disabled={isLoading}
                />
              )}

              {(isArmed || isPending || isTriggered) && (
                <QuickActions
                  onDisarm={handleDisarmClick}
                  showDisarm={true}
                  showPanic={isTriggered}
                  disabled={isLoading}
                />
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="w-full mt-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm text-center">
                {error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <AlarmHistory events={recentEvents} maxItems={5} />
        </CardContent>
      </Card>

      {/* Keypad Modal */}
      {showKeypad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="w-full max-w-sm mx-4">
            <CardHeader>
              <CardTitle className="text-center">
                {mode === 'arming' ? 'Enter Code to Arm' : 'Enter Code to Disarm'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Keypad
                onSubmit={handleCodeSubmit}
                onCancel={handleCancel}
                disabled={isLoading}
                submitLabel={mode === 'arming' ? 'Arm' : 'Disarm'}
              />
              {error && (
                <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm text-center">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default AlarmPanel
