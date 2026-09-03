import { useId, useState, type ReactNode } from 'react'

interface ResponsiveSectionProps {
  title: string
  summary: string
  children: ReactNode
  className?: string
}

export function ResponsiveSection({
  title,
  summary,
  children,
  className = '',
}: ResponsiveSectionProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const contentId = useId()

  return (
    <section
      className={`mobile-disclosure ${mobileOpen ? 'mobile-disclosure--open' : ''} ${className}`.trim()}
    >
      <button
        type="button"
        className="mobile-disclosure__summary"
        aria-expanded={mobileOpen}
        aria-controls={contentId}
        onClick={() => setMobileOpen((open) => !open)}
      >
        <span>{title}</span>
        <small>{summary}</small>
      </button>
      <div id={contentId} className="mobile-disclosure__content">
        {children}
      </div>
    </section>
  )
}
