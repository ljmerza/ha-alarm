import { useState, useCallback } from 'react'
import { useAlarm } from '@/hooks/useAlarm'
import { type AlarmStateType } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { handleError } from '@/lib/errorHandler'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Modal } from '@/components/ui/modal'
import { AlarmStatus } from './AlarmStatus'
import { ArmButtons } from './ArmButtons'
import { Keypad } from './Keypad'
import { CountdownTimer } from './CountdownTimer'
import { QuickActions } from './QuickActions'
import { AlarmHistory } from './AlarmHistory'

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
    openSensors,
    unknownSensors,
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
      } catch (error) {
        // Categorize error and handle appropriately
        const appError = handleError(error, { silent: true })

        // For validation errors (wrong code), keep modal open so user can retry
        // For other errors (network, server), show toast and close modal
        if (appError.category !== 'validation') {
          handleError(error)
          handleCancel()
        }
        // Validation errors are shown inline via useAlarm().error
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
    } catch (error) {
      // Show error via toast
      handleError(error)
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
                <div className="space-y-3">
                  {(openSensors.length > 0 || unknownSensors.length > 0) && (
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="font-medium">Arming warnings</div>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {openSensors.length > 0 && (
                          <li>
                            {openSensors.length} sensor{openSensors.length === 1 ? '' : 's'} open
                            {' '}({openSensors.slice(0, 2).map((s) => s.name).join(', ')}
                            {openSensors.length > 2 ? ', …' : ''})
                          </li>
                        )}
                        {unknownSensors.length > 0 && (
                          <li>
                            {unknownSensors.length} sensor{unknownSensors.length === 1 ? '' : 's'} unavailable
                            {' '}({unknownSensors.slice(0, 2).map((s) => s.name).join(', ')}
                            {unknownSensors.length > 2 ? ', …' : ''})
                          </li>
                        )}
                        <li>Arming is still allowed, but behavior may be unexpected.</li>
                      </ul>
                    </div>
                  )}

                  <ArmButtons
                    onArm={handleArmClick}
                    availableStates={availableArmingStates}
                    currentState={currentState}
                    disabled={isLoading}
                  />
                </div>
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
              <Alert variant="error" layout="inline" className="mt-4 text-center">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
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
        <Modal
          open={showKeypad}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) handleCancel()
          }}
          title={mode === 'arming' ? 'Enter Code to Arm' : 'Enter Code to Disarm'}
          maxWidthClassName="max-w-sm"
          showCloseButton={false}
        >
          <Keypad
            onSubmit={handleCodeSubmit}
            onCancel={handleCancel}
            disabled={isLoading}
            submitLabel={mode === 'arming' ? 'Arm' : 'Disarm'}
          />
          {error && (
            <Alert variant="error" layout="inline" className="mt-4 text-center">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </Modal>
      )}
    </div>
  )
}

export default AlarmPanel
