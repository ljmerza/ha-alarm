import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { AlarmRealtimeProvider } from '@/components/providers/AlarmRealtimeProvider'
import { ConnectionStatusBanner } from '@/components/ui/ConnectionStatusBanner'

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <AlarmRealtimeProvider />
      {/* Main Content */}
      <div className="flex flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 lg:pb-8">
          <Outlet />
        </main>
      </div>
      <ConnectionStatusBanner />
    </div>
  )
}

export default AppShell
