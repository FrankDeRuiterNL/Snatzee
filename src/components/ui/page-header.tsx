import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  subtitle,
  action,
  backHref,
  className,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  backHref?: string
  className?: string
}) {
  return (
    <header className={cn('flex items-start gap-3 px-5 pt-2 pb-5', className)}>
      {backHref && (
        <Link
          href={backHref}
          aria-label="Terug"
          className="press mt-1 grid size-11 shrink-0 place-items-center rounded-full bg-white text-navy-900 ring-1 ring-navy-100 shadow-soft"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-navy-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-navy-300">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </header>
  )
}
