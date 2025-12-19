import { Menu, Bell, User, LogOut, Moon, Sun, Monitor } from 'lucide-react'
import { useAuthStore, useUIStore, useAlarmStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlarmStateLabels, AlarmState } from '@/lib/constants'

export function Header() {
  const { user, logout } = useAuthStore()
  const { toggleSidebar, theme, setTheme, isMobile } = useUIStore()
  const { alarmState, wsStatus } = useAlarmStore()

  const currentState = alarmState?.currentState ?? AlarmState.DISARMED

  const getStateBadgeVariant = () => {
    switch (currentState) {
      case AlarmState.DISARMED:
        return 'default'
      case AlarmState.TRIGGERED:
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  const cycleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
      {/* Mobile Menu Button */}
      {isMobile && (
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      )}

      {/* Alarm Status Badge */}
      <div className="flex items-center gap-2">
        <Badge variant={getStateBadgeVariant()} className="text-xs">
          {AlarmStateLabels[currentState]}
        </Badge>
        {wsStatus !== 'connected' && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {wsStatus === 'connecting' ? 'Connecting...' : 'Offline'}
          </Badge>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side controls */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <Button variant="ghost" size="icon" onClick={cycleTheme}>
          <ThemeIcon className="h-5 w-5" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="sr-only">Notifications</span>
        </Button>

        {/* User Menu */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="hidden md:flex gap-2">
            <User className="h-4 w-4" />
            <span>{user?.displayName || 'User'}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout()}
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
            <span className="sr-only">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  )
}

export default Header
