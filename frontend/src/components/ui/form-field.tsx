import * as React from 'react'

import { cn } from '@/lib/utils'
import { HelpTip } from '@/components/ui/help-tip'

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode
  htmlFor?: string
  description?: React.ReactNode
  help?: string
  error?: React.ReactNode
  required?: boolean
}

export function FormField({
  label,
  htmlFor,
  description,
  help,
  error,
  required,
  className,
  children,
  ...props
}: FormFieldProps) {
  const helpId = React.useId()
  const descriptionId = React.useId()
  const errorId = React.useId()

  const describedBy = [
    description ? descriptionId : null,
    error ? errorId : null,
    help ? helpId : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cn('space-y-2', className)} {...props}>
      {label ? (
        <div className="flex items-center gap-2">
          <label
            className="text-sm font-medium"
            htmlFor={htmlFor}
            aria-describedby={describedBy || undefined}
          >
            {label}
            {required ? <span className="ml-1 text-destructive">*</span> : null}
          </label>
          {help ? <HelpTip content={help} /> : null}
        </div>
      ) : null}

      <div>{children}</div>

      {description ? (
        <div id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </div>
      ) : null}
      {help && !label ? (
        <div id={helpId} className="text-xs text-muted-foreground">
          {help}
        </div>
      ) : null}
      {error ? (
        <div id={errorId} className="text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  )
}

