import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { eventLayerIds } from './components/map/eventLayer'
import { routeLayerIds } from './components/map/routeLayer'
import { Map as MockMap } from './test/maplibreMock'

vi.mock('maplibre-gl', async () => import('./test/maplibreMock'))

describe('integrated application flows', () => {
  beforeEach(() => {
    MockMap.reset()
  })

  it('runs the page to filter, playback, source and dispute flow without a reload', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))

    expect(
      screen.getByText(/当前共享结果：事件 10，路线段 8/),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '1×' })).toBeChecked()
    expect(
      screen.getByRole('checkbox', {
        name: /显示争议\/低可信替代内容/,
      }),
    ).not.toBeChecked()

    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1934-10-02' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /中央红军/ }))
    expect(
      screen.getByText(/当前共享结果：事件 1，路线段 8/),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '开始路线播放' }))
    expect(
      screen.getByRole('button', { name: '暂停路线播放' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '2×' }))
    fireEvent.click(screen.getByRole('button', { name: '暂停路线播放' }))
    expect(
      screen.getByRole('button', { name: '继续路线播放' }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /红一军团攻占黎平县城/ }),
    )
    const eventDialog = screen.getByRole('dialog')
    expect(eventDialog).toHaveAccessibleName(/event_liping_capture_1934_12_15/)
    fireEvent.click(
      within(eventDialog).getByRole('button', { name: '查看来源（2）' }),
    )
    expect(
      within(eventDialog).getByRole('heading', { name: '支持（2）' }),
    ).toBeInTheDocument()
    const reverse = within(eventDialog).getByRole('button', {
      name: '查看关联声明（2）',
    })
    fireEvent.click(reverse)
    const reversePanel = document.getElementById(
      reverse.getAttribute('aria-controls')!,
    )
    expect(reversePanel).not.toBeNull()
    expect(
      within(reversePanel!).getByText('claim_place_liping_city_had_name'),
    ).toBeInTheDocument()
    fireEvent.click(
      within(eventDialog).getByRole('button', { name: '关闭对象详情' }),
    )

    fireEvent.click(screen.getByRole('button', { name: /路线A · 路段4/ }))
    const routeDialog = screen.getByRole('dialog')
    expect(routeDialog).toHaveAccessibleName(/seg_t06_r4_placeholder/)
    expect(
      within(routeDialog).getAllByRole('button', { name: '查看来源（0）' }),
    ).toHaveLength(2)
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /显示争议\/低可信替代内容/,
      }),
    )

    const alternatives = () =>
      (
        map.sources.get(routeLayerIds.source)?.data as {
          features: Array<{
            id: string
            properties: { route_certainty: string }
          }>
        }
      ).features
        .filter((feature) => feature.properties.route_certainty === 'R4')
        .map((feature) => feature.id)

    fireEvent.click(screen.getByRole('radio', { name: '方案A' }))
    expect(alternatives()).toEqual(['feature_t06_r4_a_placeholder'])
    fireEvent.click(screen.getByRole('radio', { name: '方案B' }))
    expect(alternatives()).toEqual(['feature_t06_r4_b_placeholder'])
    fireEvent.click(screen.getByRole('radio', { name: 'A+B并列' }))
    expect(alternatives()).toEqual([
      'feature_t06_r4_a_placeholder',
      'feature_t06_r4_b_placeholder',
    ])
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      /seg_t06_r4_placeholder/,
    )
    expect(MockMap.instances).toHaveLength(1)
  })

  it('clears hidden state and remains single-instance after repeated filters and style reload', async () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))

    fireEvent.click(
      screen.getByRole('button', { name: /待核验结构测试路线A · 路段1/ }),
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '开始路线播放' }))
    fireEvent.click(
      screen.getByRole('checkbox', { name: /中国工农红军第一军团/ }),
    )
    await Promise.resolve()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '开始路线播放' }),
    ).toBeInTheDocument()
    expect(map.filters.get(routeLayerIds.selectedLines)).toEqual([
      '==',
      ['get', 'route_segment_id'],
      '__t06_no_selected_route_segment__',
    ])

    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: '清除部队筛选' }))
      fireEvent.click(screen.getByRole('checkbox', { name: /中央红军/ }))
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: /显示争议\/低可信替代内容/,
        }),
      )
      fireEvent.click(
        screen.getByRole('radio', { name: index % 2 ? '方案A' : '方案B' }),
      )
      act(() => map.emit('style.load'))
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: /显示争议\/低可信替代内容/,
        }),
      )
    }

    const events = (
      map.sources.get(eventLayerIds.source)?.data as {
        features: Array<{ properties: { event_id: string } }>
      }
    ).features
    expect(events.map((feature) => feature.properties.event_id)).toEqual([
      'event_liping_capture_1934_12_15',
    ])
    expect(MockMap.instances).toHaveLength(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps placeholder claims as unknown draft records with an honest zero-evidence state', () => {
    render(<App />)
    fireEvent.click(
      screen.getByRole('button', { name: /查看地点：结构测试历史名S0/ }),
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName(/place · place_t04_s0_placeholder/)
    expect(
      within(dialog).getByText('claim_t04_s0_placeholder'),
    ).toBeInTheDocument()
    expect(within(dialog).getAllByText('unknown')).toHaveLength(1)
    expect(within(dialog).getByText('C-U')).toBeInTheDocument()
    expect(within(dialog).getAllByText('待核验').length).toBeGreaterThan(0)
    const zeroEvidence = within(dialog).getByRole('button', {
      name: '查看来源（0）',
    })
    fireEvent.click(zeroEvidence)
    expect(within(dialog).getByText(/暂无史料证据链接/)).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('证据可追溯满足最低门槛')
  })
})
