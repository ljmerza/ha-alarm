import { Link } from 'react-router-dom'
import { LayoutGrid, MapPin, List, KeyRound, Settings } from 'lucide-react'
import { Routes as AppRoutes } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function QuickLinksCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quick Links</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="justify-start">
          <Link to={AppRoutes.HOME}>
            <LayoutGrid />
            Home
          </Link>
        </Button>
        <Button asChild variant="outline" className="justify-start">
          <Link to={AppRoutes.ZONES}>
            <MapPin />
            Zones
          </Link>
        </Button>
        <Button asChild variant="outline" className="justify-start">
          <Link to={AppRoutes.EVENTS}>
            <List />
            Events
          </Link>
        </Button>
        <Button asChild variant="outline" className="justify-start">
          <Link to={AppRoutes.CODES}>
            <KeyRound />
            Codes
          </Link>
        </Button>
        <Button asChild variant="outline" className="justify-start col-span-2">
          <Link to={AppRoutes.SETTINGS}>
            <Settings />
            Settings
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export default QuickLinksCard
