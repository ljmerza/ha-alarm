import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function parseLocalDateTime(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function getTimePart(value: string, fallback: string): string {
  const match = value.match(/T(\d{2}:\d{2})/)
  return match?.[1] || fallback
}

function withDatePreserveTime(existing: string, date: Date, fallbackTime: string): string {
  const time = getTimePart(existing, fallbackTime)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${time}`
}

function withTimePreserveDate(existing: string, time: string): string {
  const parsed = parseLocalDateTime(existing)
  if (!parsed) return ''
  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${time}`
}

export type DateTimeRangeValue = {
  start: string
  end: string
}

type DateTimeRangePickerProps = {
  label?: string
  value: DateTimeRangeValue
  onChange: (value: DateTimeRangeValue) => void
  disabled?: boolean
}

export function DateTimeRangePicker({
  label = 'Active window',
  value,
  onChange,
  disabled = false,
}: DateTimeRangePickerProps) {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  const startDate = useMemo(() => parseLocalDateTime(value.start), [value.start])
  const endDate = useMemo(() => parseLocalDateTime(value.end), [value.end])

  const [month, setMonth] = useState<Date>(() => startDate || endDate || new Date())

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!open) return
      const target = event.target as Node | null
      if (!target) return
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const displayValue = useMemo(() => {
    if (!startDate && !endDate) return 'Select date range…'
    if (startDate && !endDate) return `${format(startDate, 'PP p')} → …`
    if (!startDate && endDate) return `… → ${format(endDate, 'PP p')}`
    return `${format(startDate!, 'PP p')} → ${format(endDate!, 'PP p')}`
  }, [startDate, endDate])

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month))
    const end = endOfWeek(endOfMonth(month))
    const days: Date[] = []
    for (let d = start; !isAfter(d, end); d = addDays(d, 1)) {
      days.push(d)
    }
    return days
  }, [month])

  const onPickDay = (day: Date) => {
    if (disabled) return
    const existingStart = value.start
    const existingEnd = value.end
    const existingStartDate = parseLocalDateTime(existingStart)
    const existingEndDate = parseLocalDateTime(existingEnd)

    if (!existingStartDate || (existingStartDate && existingEndDate)) {
      onChange({
        start: withDatePreserveTime(existingStart, day, '00:00'),
        end: '',
      })
      return
    }

    if (isBefore(day, existingStartDate)) {
      onChange({
        start: withDatePreserveTime(existingStart, day, '00:00'),
        end: withDatePreserveTime(existingEnd, existingStartDate, '00:00'),
      })
      return
    }

    onChange({
      start: existingStart,
      end: withDatePreserveTime(existingEnd, day, '00:00'),
    })
  }

  const isInRange = (day: Date): boolean => {
    if (!startDate || !endDate) return false
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
    return isWithinInterval(day, { start, end })
  }

  const isRangeStart = (day: Date): boolean => !!startDate && isSameDay(day, startDate)
  const isRangeEnd = (day: Date): boolean => !!endDate && isSameDay(day, endDate)

  const clear = () => onChange({ start: '', end: '' })

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>

      <div className="relative" ref={popoverRef}>
        <Button
          type="button"
          variant="secondary"
          className="w-full justify-between"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
        >
          <span className={cn('truncate', !startDate && !endDate && 'text-muted-foreground')}>
            {displayValue}
          </span>
          <span className="text-muted-foreground">▾</span>
        </Button>

        {open && (
          <div className="absolute z-50 mt-2 w-full rounded-md border bg-popover p-3 shadow-md">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Button type="button" variant="secondary" onClick={() => setMonth((m) => subMonths(m, 1))}>
                Prev
              </Button>
              <div className="text-sm font-medium">{format(month, 'MMMM yyyy')}</div>
              <Button type="button" variant="secondary" onClick={() => setMonth((m) => addMonths(m, 1))}>
                Next
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const muted = day.getMonth() !== month.getMonth()
                const selected = isRangeStart(day) || isRangeEnd(day)
                const inRange = isInRange(day)
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={cn(
                      'h-9 rounded-md border border-transparent text-sm',
                      muted && 'text-muted-foreground',
                      inRange && 'bg-primary/10',
                      selected && 'bg-primary text-primary-foreground',
                      !disabled && 'hover:border-input hover:bg-muted'
                    )}
                    onClick={() => onPickDay(day)}
                    disabled={disabled}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">From</div>
                <Input
                  type="time"
                  value={getTimePart(value.start, '00:00')}
                  onChange={(e) => onChange({ start: withTimePreserveDate(value.start, e.target.value), end: value.end })}
                  disabled={disabled || !startDate}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Until</div>
                <Input
                  type="time"
                  value={getTimePart(value.end, '00:00')}
                  onChange={(e) => onChange({ start: value.start, end: withTimePreserveDate(value.end, e.target.value) })}
                  disabled={disabled || !endDate}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <Button type="button" variant="secondary" onClick={clear} disabled={disabled}>
                Clear
              </Button>
              <Button type="button" onClick={() => setOpen(false)} disabled={disabled}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DateTimeRangePicker
