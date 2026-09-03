type PlaceholderKind = 'empty' | 'loading' | 'unavailable'

interface LayoutPlaceholderProps {
  kind: PlaceholderKind
  title: string
  description: string
}

export function LayoutPlaceholder({
  kind,
  title,
  description,
}: LayoutPlaceholderProps) {
  return (
    <section className={`layout-placeholder layout-placeholder--${kind}`}>
      <h3>{title}</h3>
      <p>{description}</p>
    </section>
  )
}
