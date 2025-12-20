import { Link, useLocation } from 'react-router-dom'
import { Shield, Gavel, Key, Clock, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Routes } from '@/lib/constants'

const navItems = [
  { path: Routes.HOME, label: 'Dashboard', icon: Shield },
  { path: Routes.RULES, label: 'Rules', icon: Gavel },
  { path: Routes.CODES, label: 'Codes', icon: Key },
  { path: Routes.EVENTS, label: 'Events', icon: Clock },
  { path: Routes.SETTINGS, label: 'Settings', icon: Settings },
]

export function MobileNav() {
  const location = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border lg:hidden">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          const Icon = item.icon

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[64px]',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default MobileNav
