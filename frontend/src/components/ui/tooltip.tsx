import { useId, useState } from 'react'

type TooltipProps = {
  content: string
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}

function sideClasses(side: TooltipProps['side']) {
  switch (side) {
    case 'left':
      return 'right-full top-1/2 -translate-y-1/2 mr-2'
    case 'right':
      return 'left-full top-1/2 -translate-y-1/2 ml-2'
    case 'bottom':
      return 'top-full left-1/2 -translate-x-1/2 mt-2'
    case 'top':
    default:
      return 'bottom-full left-1/2 -translate-x-1/2 mb-2'
  }
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const tooltipId = useId()
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex">
      <span
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>

      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={[
            'pointer-events-none absolute z-50 w-max max-w-[420px] rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md',
            sideClasses(side),
          ].join(' ')}
        >
          {content}
        </span>
      )}
    </span>
  )
}

export default Tooltip
