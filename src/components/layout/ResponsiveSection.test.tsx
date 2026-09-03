import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResponsiveSection } from './ResponsiveSection'

describe('responsive section disclosure', () => {
  it('uses an accessible toggle and keeps child state mounted while collapsed', () => {
    render(
      <ResponsiveSection title="事件列表" summary="10 项">
        <input aria-label="响应式状态样例" defaultValue="保留" />
      </ResponsiveSection>,
    )

    const toggle = screen.getByRole('button', { name: /事件列表/ })
    const input = screen.getByLabelText('响应式状态样例')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', input.parentElement?.id)

    fireEvent.change(input, { target: { value: '视口切换后保留' } })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveValue('视口切换后保留')
  })

  it('keeps one shared mobile breakpoint with bottom drawers and safe wrapping', () => {
    const styles = readFileSync(
      join(process.cwd(), 'src', 'styles', 'layout.css'),
      'utf8',
    )
    const detailStyles = readFileSync(
      join(process.cwd(), 'src', 'components', 'details', 'DetailDrawer.css'),
      'utf8',
    )

    expect(styles).toContain('@media (max-width: 48rem)')
    expect(styles).toContain('.filter-sidebar--mobile-open')
    expect(styles).toContain('.info-panel--active')
    expect(styles).toContain('max-height: calc(82dvh - 4rem)')
    expect(styles).toContain('overflow-wrap: anywhere')
    expect(detailStyles).toContain(
      'max-height: calc(100dvh - (2 * var(--layout-padding)))',
    )
    expect(detailStyles).toContain('overflow-y: auto')
  })
})
