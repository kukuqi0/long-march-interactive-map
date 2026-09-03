import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { eventLayerIds } from './components/map/eventLayer'
import { placeLayerIds } from './components/map/placeLayer'
import { routeLayerIds } from './components/map/routeLayer'
import { Map as MockMap } from './test/maplibreMock'
import { timelineDateToIndex } from './utils/timeline'

vi.mock('maplibre-gl', async () => import('./test/maplibreMock'))

describe('application layout and map integration', () => {
  beforeEach(() => {
    MockMap.reset()
  })
  it('renders the project name and public data notice', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: '红军长征专题交互地图' }),
    ).toBeInTheDocument()
    expect(screen.getByText('交互地图原型')).toBeInTheDocument()
    expect(screen.getByText('资料持续整理中')).toBeInTheDocument()
    expect(
      screen.getByText(/数据说明：本专题目前仍在资料整理与核验阶段/),
    ).toBeInTheDocument()
  })

  it('exposes all five layout regions with accessible names', () => {
    render(<App />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main', { name: '地图' })).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: '筛选区域' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: '详情区域' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('contentinfo', { name: '时间过滤' }),
    ).toBeInTheDocument()
  })

  it('has exactly one level-one heading', () => {
    render(<App />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('shows organization and route-certainty controls', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: '组织/部队' }),
    ).toBeInTheDocument()
    expect(screen.getByText('事件类型（未实现）')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '确定性 / 争议' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('路线确定性（未实现）')).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(9)
    expect(
      screen.getByRole('button', { name: /收起中央红军聚合成员/ }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('产品聚合')).toBeInTheDocument()
    expect(screen.getByText('历史组织')).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(6)
  })

  it('keeps shared business state across mobile and desktop layout changes', () => {
    const originalInnerWidth = window.innerWidth
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')

    const mobileFilter = screen.getByRole('button', {
      name: /打开筛选与图例/,
    })
    expect(mobileFilter).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(mobileFilter)
    expect(mobileFilter).toHaveAttribute('aria-expanded', 'true')

    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1935-07-21' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /中央红军/ }))
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /显示争议\/低可信替代内容/,
      }),
    )
    fireEvent.click(screen.getByRole('radio', { name: '方案B' }))
    fireEvent.click(screen.getByRole('radio', { name: '2×' }))

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 360,
    })
    fireEvent(window, new Event('resize'))
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1440,
    })
    fireEvent(window, new Event('resize'))

    expect(screen.getByLabelText('参考日期')).toHaveValue('1935-07-21')
    expect(screen.getByRole('checkbox', { name: /中央红军/ })).toBeChecked()
    expect(
      screen.getByRole('checkbox', {
        name: /显示争议\/低可信替代内容/,
      }),
    ).toBeChecked()
    expect(screen.getByRole('radio', { name: '方案B' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '2×' })).toBeChecked()
    expect(MockMap.instances).toHaveLength(1)

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    })
  })

  it('exposes mobile list, timeline and detail drawer controls without duplicating content', () => {
    render(<App />)

    for (const name of [
      '地点与详情入口',
      '事件列表',
      '路线段列表',
      '日期游标与事件导航',
      '日期轨',
      '仅顺序（T6）',
      '时间未知（TU）',
    ]) {
      expect(
        screen.getByRole('button', { name: new RegExp(name) }),
      ).toHaveAttribute('aria-expanded', 'false')
    }

    fireEvent.click(screen.getByRole('button', { name: /查看地点：黎平县城/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '关闭对象详情抽屉' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭对象详情抽屉' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mounts the base map inside the main region', () => {
    render(<App />)

    expect(
      screen.getByRole('region', {
        name: '地图，可使用键盘或指针缩放和平移',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('地图加载中')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '地点记录' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/已加载8条地点记录/)).toBeInTheDocument()
  })

  it('shows one concise empty detail state', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '详情' })).toBeInTheDocument()
    expect(
      screen.getByText('选择地图中的地点、事件或路线查看详细信息。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('对象摘要（未选择对象）')).not.toBeInTheDocument()
  })

  it('shows time filters, event navigation and playback controls', () => {
    render(<App />)

    expect(screen.getByLabelText('参考日期')).toBeInTheDocument()
    expect(screen.getByLabelText('时间状态')).toHaveValue('all')
    expect(screen.getByRole('button', { name: '应用过滤' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清除过滤' })).toBeInTheDocument()
    expect(screen.getByRole('slider')).toBeDisabled()
    expect(screen.getByRole('button', { name: '上一事件' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一事件' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: '开始路线播放' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '1×' })).toBeChecked()
  })

  it('shows certainty controls without search or SVG charts', () => {
    const { container } = render(<App />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('slider')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(9)
    expect(screen.getAllByRole('radio')).toHaveLength(6)
    expect(container.querySelector('canvas')).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeInTheDocument()
  })

  it('synchronizes a delegated map event click to one selected list item', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) {
      throw new Error('Expected MapLibre mock instance')
    }

    const meetingButton = screen.getByRole('button', {
      name: /待核验占位：会议类型事件A/,
    })
    expect(meetingButton).toHaveAttribute('aria-pressed', 'false')

    act(() => {
      map.emitLayer('click', eventLayerIds.symbols, {
        features: [
          {
            id: 'event_t05_meeting_placeholder',
            properties: { event_id: 'event_t05_meeting_placeholder' },
          },
        ],
      })
    })

    expect(meetingButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText(/当前选中/)).toHaveLength(1)
  })

  it('synchronizes list selection to the map filter without navigation or storage', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) {
      throw new Error('Expected MapLibre mock instance')
    }
    act(() => map.emit('load'))

    fireEvent.click(
      screen.getByRole('button', {
        name: /待核验占位：战役类型事件A/,
      }),
    )

    expect(map.filters.get(eventLayerIds.selected)).toEqual([
      '==',
      ['get', 'event_id'],
      'event_t05_battle_placeholder',
    ])
    expect(replaceState).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    replaceState.mockRestore()
    setItem.mockRestore()
  })

  it('selects an SU event in the list without inventing a point', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) {
      throw new Error('Expected MapLibre mock instance')
    }
    act(() => map.emit('load'))
    fireEvent.click(
      screen.getByRole('button', {
        name: /待核验占位：驻留类型事件A/,
      }),
    )

    const eventSource = map.sources.get(eventLayerIds.source)
    const features = (
      eventSource?.data as { features?: Array<{ id?: string }> } | undefined
    )?.features
    expect(
      features?.some((feature) => feature.id === 'event_t05_stay_placeholder'),
    ).toBe(false)
    expect(
      screen.getByRole('button', {
        name: /待核验占位：驻留类型事件A/,
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not treat a place-layer click as an event selection', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) {
      throw new Error('Expected MapLibre mock instance')
    }
    act(() => {
      map.emitLayer('click', placeLayerIds.circles, {
        features: [{ properties: { place_id: 'place_t04_s0_placeholder' } }],
      })
    })

    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('aria-pressed'))
        .every((button) => button.getAttribute('aria-pressed') === 'false'),
    ).toBe(true)
  })

  it('synchronizes a route map click with the list and supports cancellation', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) {
      throw new Error('Expected MapLibre mock instance')
    }
    const routeButton = screen.getByRole('button', {
      name: /待核验结构测试路线A · 路段2/,
    })
    act(() => {
      map.emitLayer('click', routeLayerIds.r2, {
        features: [
          {
            properties: {
              route_segment_id: 'seg_t06_r2_placeholder',
            },
          },
        ],
      })
    })
    expect(routeButton).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(routeButton)
    expect(routeButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects R5 in the list without inventing route geometry or navigation', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) {
      throw new Error('Expected MapLibre mock instance')
    }
    act(() => map.emit('load'))
    const r5Button = screen.getByRole('button', {
      name: /待核验结构测试路线A · 路段3/,
    })
    fireEvent.click(r5Button)

    const routeSource = map.sources.get(routeLayerIds.source)
    const features = (
      routeSource?.data as
        | { features?: Array<{ properties?: { route_segment_id?: string } }> }
        | undefined
    )?.features
    expect(
      features?.some(
        (feature) =>
          feature.properties?.route_segment_id === 'seg_t06_r5_placeholder',
      ),
    ).toBe(false)
    expect(r5Button).toHaveAttribute('aria-pressed', 'true')
    expect(map).not.toHaveProperty('flyToCalls')
  })

  it('opens details from a list and restores focus without clearing selection', async () => {
    render(<App />)
    const button = screen.getByRole('button', {
      name: /待核验占位：会议类型事件A/,
    })
    fireEvent.click(button)
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/event/)
    expect(button).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '关闭对象详情' }))
    await Promise.resolve()
    expect(button).toHaveFocus()
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens a place detail from the map and returns focus to the map region', async () => {
    render(<App />)
    const mapRegion = screen.getByRole('region', {
      name: '地图，可使用键盘或指针缩放和平移',
    })
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => {
      map.emitLayer('click', placeLayerIds.circles, {
        features: [{ properties: { place_id: 'place_t04_s1_placeholder' } }],
      })
    })
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/place/)
    fireEvent.keyDown(document, { key: 'Escape' })
    await Promise.resolve()
    expect(mapRegion).toHaveFocus()
  })

  it('switches route detail to the actual organization without stacking drawers', () => {
    render(<App />)
    fireEvent.click(
      screen.getByRole('button', { name: /待核验结构测试路线A · 路段1/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: /打开组织详情/ }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      /organization · org_central_red_army/,
    )
    expect(screen.getByText('专题分组说明')).toBeInTheDocument()
  })

  it('returns focus to the original route list trigger after an in-drawer switch', async () => {
    render(<App />)
    const routeButton = screen.getByRole('button', {
      name: /待核验结构测试路线A · 路段1/,
    })
    fireEvent.click(routeButton)
    fireEvent.click(screen.getByRole('button', { name: /打开组织详情/ }))
    fireEvent.click(screen.getByRole('button', { name: '关闭对象详情' }))
    await Promise.resolve()
    expect(routeButton).toHaveFocus()
  })

  it('closes detail when the same route selection is cancelled', () => {
    render(<App />)
    const routeButton = screen.getByRole('button', {
      name: /待核验结构测试路线A · 路段2/,
    })
    fireEvent.click(routeButton)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(routeButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(routeButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('offers keyboard-operable place detail entries without adding search or filters', () => {
    render(<App />)
    const placeButton = screen.getByRole('button', {
      name: /查看地点：结构测试历史名S1/,
    })
    placeButton.focus()
    fireEvent.keyDown(placeButton, { key: 'Enter' })
    fireEvent.click(placeButton)
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/place/)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(9)
  })

  it('does not apply a date status without a valid reference date', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('时间状态'), {
      target: { value: 'current' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    expect(screen.getByRole('alert')).toHaveTextContent('合法的 YYYY-MM-DD')
    expect(
      screen.getAllByRole('button', { name: /待核验占位：/ }),
    ).toHaveLength(9)
  })

  it('uses one filtered result for lists and both map sources', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))
    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1934-11-03' },
    })
    fireEvent.change(screen.getByLabelText('时间状态'), {
      target: { value: 'current' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))

    expect(
      screen.getByRole('button', { name: /会议类型事件A/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /战役类型事件A/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /路线A · 路段4/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /路线A · 路段1/ }),
    ).not.toBeInTheDocument()

    const eventFeatures = (
      map.sources.get(eventLayerIds.source)?.data as {
        features: Array<{ properties: { event_id: string } }>
      }
    ).features
    expect(eventFeatures.map((feature) => feature.properties.event_id)).toEqual(
      ['event_t05_meeting_placeholder'],
    )
    const routeFeatures = (
      map.sources.get(routeLayerIds.source)?.data as {
        features: Array<{
          properties: {
            route_segment_id: string
            alternative_id: string | null
          }
        }>
      }
    ).features
    expect(routeFeatures).toHaveLength(0)

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /显示争议\/低可信替代内容/,
      }),
    )
    const revealedRouteFeatures = (
      map.sources.get(routeLayerIds.source)?.data as {
        features: Array<{
          properties: {
            route_segment_id: string
            alternative_id: string | null
          }
        }>
      }
    ).features
    expect(revealedRouteFeatures).toHaveLength(2)
    expect(
      new Set(
        revealedRouteFeatures.map(
          (feature) => feature.properties.alternative_id,
        ),
      ),
    ).toEqual(new Set(['A', 'B']))

    act(() => map.emit('style.load'))
    const restoredRouteFeatures = (
      map.sources.get(routeLayerIds.source)?.data as {
        features: Array<{ properties: { route_segment_id: string } }>
      }
    ).features
    expect(restoredRouteFeatures).toHaveLength(2)
    expect(
      restoredRouteFeatures.every(
        (feature) =>
          feature.properties.route_segment_id === 'seg_t06_r4_placeholder',
      ),
    ).toBe(true)
    expect(MockMap.instances).toHaveLength(1)
  })

  it('clears a hidden selection, highlight and detail without reviving them later', async () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))
    const battle = screen.getByRole('button', { name: /战役类型事件A/ })
    fireEvent.click(battle)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1935-01-15' },
    })
    fireEvent.change(screen.getByLabelText('时间状态'), {
      target: { value: 'current' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    await Promise.resolve()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '时间过滤' })).toHaveFocus()
    expect(map.filters.get(eventLayerIds.selected)).toEqual([
      '==',
      ['get', 'event_id'],
      '__t05_no_selected_event__',
    ])

    fireEvent.click(screen.getByRole('button', { name: '清除过滤' }))
    expect(
      screen.getByRole('button', { name: /战役类型事件A/ }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps T6 and TU distinct without creating R5, RU or SU geometry', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))

    fireEvent.change(screen.getByLabelText('时间状态'), {
      target: { value: 'sequence_only' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    expect(
      screen.getByRole('button', { name: /会师类型事件A/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /路线A · 路段3/ }),
    ).toBeInTheDocument()
    expect(
      (map.sources.get(routeLayerIds.source)?.data as { features: unknown[] })
        .features,
    ).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('时间状态'), {
      target: { value: 'unknown' },
    })
    expect(screen.getByLabelText('参考日期')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    expect(
      screen.getByRole('button', { name: /驻留类型事件A/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /路线B · 路段2/ }),
    ).toBeInTheDocument()
    expect(
      (map.sources.get(eventLayerIds.source)?.data as { features: unknown[] })
        .features,
    ).toHaveLength(0)
    expect(
      (map.sources.get(routeLayerIds.source)?.data as { features: unknown[] })
        .features,
    ).toHaveLength(0)
  })

  it('clears a filtered route selection and returns map-trigger focus to the map', async () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    const mapRegion = screen.getByRole('region', {
      name: '地图，可使用键盘或指针缩放和平移',
    })
    act(() => map.emit('load'))
    act(() => {
      map.emitLayer('click', routeLayerIds.r4, {
        features: [
          { properties: { route_segment_id: 'seg_t06_r4_placeholder' } },
        ],
      })
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1935-01-15' },
    })
    fireEvent.change(screen.getByLabelText('时间状态'), {
      target: { value: 'current' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    await Promise.resolve()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mapRegion).toHaveFocus()
    expect(map.filters.get(routeLayerIds.selectedLines)).toEqual([
      '==',
      ['get', 'route_segment_id'],
      '__t06_no_selected_route_segment__',
    ])
  })

  it('does not close place or organization details when applying time filters', () => {
    render(<App />)
    fireEvent.click(
      screen.getByRole('button', { name: /查看地点：结构测试历史名S1/ }),
    )
    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1935-01-15' },
    })
    fireEvent.change(screen.getByLabelText('时间状态'), {
      target: { value: 'future' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/place/)
  })

  it('shows one timeline item per event or route segment without duplicating R4 alternatives', () => {
    render(<App />)
    expect(
      screen.getAllByRole('button', { name: /时间轴事件 event_t05_/ }),
    ).toHaveLength(9)
    expect(
      screen.getByRole('button', {
        name: /时间轴事件 event_liping_capture_1934_12_15/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /时间轴路线段 seg_t06_/ }),
    ).toHaveLength(8)
    expect(
      screen.getAllByRole('button', {
        name: /时间轴路线段 seg_t06_r4_placeholder/,
      }),
    ).toHaveLength(1)
  })

  it('uses the same reference date for input, cursor and event navigation', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1934-10-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    const slider = screen.getByRole('slider')
    expect(slider).toBeEnabled()
    const expected = timelineDateToIndex('1934-10-01')
    expect(expected.ok && Number(slider.getAttribute('value') ?? 0)).toBe(
      expected.ok ? expected.value : false,
    )

    fireEvent.click(screen.getByRole('button', { name: '下一事件' }))
    expect(screen.getByLabelText('参考日期')).toHaveValue('1934-10-02')
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      /event · event_t05_battle_placeholder/,
    )
  })

  it('updates the time result from the keyboard-equivalent cursor without rebuilding the map', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1934-11-03' },
    })
    fireEvent.change(screen.getByLabelText('时间状态'), {
      target: { value: 'current' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    const target = timelineDateToIndex('1935-01-15')
    if (!target.ok) throw new Error('Expected valid test date')
    fireEvent.change(screen.getByRole('slider'), {
      target: { value: String(target.value) },
    })
    expect(screen.getByLabelText('参考日期')).toHaveValue('1935-01-15')
    expect(screen.getByText(/事件 1\/10，路线段 1\/8/)).toBeInTheDocument()
    expect(MockMap.instances).toHaveLength(1)
  })

  it('does not bypass the active time status when a navigation target becomes hidden', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1934-10-01' },
    })
    fireEvent.change(screen.getByLabelText('时间状态'), {
      target: { value: 'future' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    fireEvent.click(screen.getByRole('button', { name: '下一事件' }))
    await Promise.resolve()
    expect(screen.getByLabelText('参考日期')).toHaveValue('1934-10-02')
    expect(screen.getByText(/未绕过过滤强制高亮或打开详情/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('selects T6 and TU timeline objects without changing the reference date', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1935-01-15' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: /T6时间轴事件 event_t05_rendezvous_placeholder/,
      }),
    )
    expect(screen.getByLabelText('参考日期')).toHaveValue('1935-01-15')
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      /event · event_t05_rendezvous_placeholder/,
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /TU时间轴路线段 seg_t06_ru_placeholder/,
      }),
    )
    expect(screen.getByLabelText('参考日期')).toHaveValue('1935-01-15')
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      /route_segment · seg_t06_ru_placeholder/,
    )
  })

  it('keeps R4 alternatives separated when selected from its single timeline item', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /显示争议\/低可信替代内容/,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /时间轴路线段 seg_t06_r4_placeholder/,
      }),
    )
    expect(map.filters.get(routeLayerIds.selectedLines)).toEqual([
      '==',
      ['get', 'route_segment_id'],
      'seg_t06_r4_placeholder',
    ])
    const features = (
      map.sources.get(routeLayerIds.source)?.data as {
        features: Array<{ properties: { alternative_id: string | null } }>
      }
    ).features.filter((feature) => feature.properties.alternative_id)
    expect(
      features.map((feature) => feature.properties.alternative_id),
    ).toEqual(['A', 'B'])
  })

  it('keeps the R4 record and dispute badge visible while disputed geometries default off', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))
    expect(
      screen.getByRole('button', { name: /路线A · 路段4/ }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/争议方案演示/).length).toBeGreaterThan(0)
    expect(
      (
        map.sources.get(routeLayerIds.source)?.data as {
          features: Array<{ properties: { route_certainty: string } }>
        }
      ).features.some((feature) => feature.properties.route_certainty === 'R4'),
    ).toBe(false)
    expect(
      screen.getByRole('checkbox', {
        name: /显示争议\/低可信替代内容/,
      }),
    ).not.toBeChecked()
  })

  it('switches among existing A, B and A+B features without closing the same segment detail', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))
    fireEvent.click(screen.getByRole('button', { name: /路线A · 路段4/ }))
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
    expect(alternatives()).toEqual([
      'feature_t06_r4_a_placeholder',
      'feature_t06_r4_b_placeholder',
    ])
    fireEvent.click(screen.getByRole('radio', { name: '方案A' }))
    expect(alternatives()).toEqual(['feature_t06_r4_a_placeholder'])
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      /seg_t06_r4_placeholder/,
    )
    expect(screen.getByText('方案A', { selector: 'dd' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '方案B' }))
    expect(alternatives()).toEqual(['feature_t06_r4_b_placeholder'])
    expect(screen.getByText('方案B', { selector: 'dd' })).toBeInTheDocument()
  })

  it('clears route detail and highlight when certainty filtering hides its segment', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))
    fireEvent.click(screen.getByRole('button', { name: /路线A · 路段4/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('checkbox', { name: /R4 争议路线 \/ A-B方案/ }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /路线A · 路段4/ }),
    ).not.toBeInTheDocument()
    expect(map.filters.get(routeLayerIds.selectedLines)).toEqual([
      '==',
      ['get', 'route_segment_id'],
      '__t06_no_selected_route_segment__',
    ])
  })

  it('does not hide R5 or RU when only the disputed C-D alternative toggle changes', () => {
    render(<App />)
    expect(
      screen.getByRole('button', { name: /路线A · 路段5/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /路线B · 路段2/ }),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /显示争议\/低可信替代内容/,
      }),
    )
    expect(
      screen.getByRole('button', { name: /路线A · 路段5/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /路线B · 路段2/ }),
    ).toBeInTheDocument()
  })

  it('clears the cursor to an honest no-date state without reviving an old timeline selection', () => {
    render(<App />)
    fireEvent.click(
      screen.getByRole('button', {
        name: /时间轴事件 event_t05_battle_placeholder/,
      }),
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('时间状态'), {
      target: { value: 'unknown' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除过滤' }))
    expect(screen.getByLabelText('参考日期')).toHaveValue('')
    expect(screen.getByLabelText('参考日期')).toBeEnabled()
    expect(screen.getByRole('slider')).toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: /时间轴事件 event_t05_battle_placeholder/,
      }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('contains no unauthorized reset, loop, autoplay or camera controls', () => {
    const { container } = render(<App />)
    expect(
      screen.queryByRole('button', { name: /重置|循环|自动播放|相机跟随/ }),
    ).not.toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/requestAnimationFrame|flyTo/)
  })

  it('starts, pauses and changes UI cadence without opening details', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '开始路线播放' }))
    expect(
      screen.getByRole('button', { name: '暂停路线播放' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/当前事件锚点/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: '2×' }))
    expect(screen.getByRole('radio', { name: '2×' })).toBeChecked()
    expect(MockMap.instances).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '暂停路线播放' }))
    expect(
      screen.getByRole('button', { name: '继续路线播放' }),
    ).toBeInTheDocument()
  })

  it('integrates the real Liping event through list, map source, detail, timeline and playback anchor', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))

    const eventButton = screen.getByRole('button', {
      name: /红一军团攻占黎平县城/,
    })
    fireEvent.click(eventButton)
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      /event · event_liping_capture_1934_12_15/,
    )
    expect(
      (
        map.sources.get(eventLayerIds.source)?.data as {
          features: Array<{ properties: { event_id: string } }>
        }
      ).features.some(
        (feature) =>
          feature.properties.event_id === 'event_liping_capture_1934_12_15',
      ),
    ).toBe(true)
    expect(
      screen.getByRole('button', {
        name: /时间轴事件 event_liping_capture_1934_12_15/,
      }),
    ).toBeInTheDocument()
  })

  it('interrupts active playback when the user changes the date', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '开始路线播放' }))
    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1935-01-15' },
    })

    expect(
      screen.getByRole('button', { name: '开始路线播放' }),
    ).toBeInTheDocument()
    expect(screen.getByText('已暂停')).toBeInTheDocument()
  })

  it('filters central aggregate routes and the explicit member event through one shared result', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))
    fireEvent.click(screen.getByRole('checkbox', { name: /中央红军/ }))

    expect(
      screen.getByText(/当前共享结果：事件 1，路线段 8/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /红一军团攻占黎平县城/ }),
    ).toHaveTextContent('组织匹配：聚合成员匹配')
    expect(
      screen.queryByRole('button', { name: /待核验占位：会议类型事件A/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /时间轴路线段 seg_t06_/ }),
    ).toHaveLength(8)
    const eventFeatures = (
      map.sources.get(eventLayerIds.source)?.data as {
        features: Array<{ properties: { event_id: string } }>
      }
    ).features
    expect(eventFeatures.map((feature) => feature.properties.event_id)).toEqual(
      ['event_liping_capture_1934_12_15'],
    )
    act(() => map.emit('style.load'))
    const restoredEvents = (
      map.sources.get(eventLayerIds.source)?.data as {
        features: Array<{ properties: { event_id: string } }>
      }
    ).features
    expect(
      restoredEvents.map((feature) => feature.properties.event_id),
    ).toEqual(['event_liping_capture_1934_12_15'])
    expect(MockMap.instances).toHaveLength(1)
  })

  it('filters the first corps to its direct event and never inherits central routes', () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))
    fireEvent.click(
      screen.getByRole('checkbox', { name: /中国工农红军第一军团/ }),
    )

    expect(
      screen.getByText(/当前共享结果：事件 1，路线段 0/),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/当前样例没有直接归属于所选组织的路线数据/).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', { name: /红一军团攻占黎平县城/ }),
    ).toHaveTextContent('组织匹配：直接匹配')
    expect(
      screen.queryByRole('button', { name: /待核验结构测试路线A · 路段1/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('button', {
        name: /时间轴事件 event_liping_capture_1934_12_15/,
      }),
    ).toHaveLength(1)
    expect(
      screen.queryByRole('button', { name: /时间轴路线段 seg_t06_/ }),
    ).not.toBeInTheDocument()
    expect(
      (map.sources.get(routeLayerIds.source)?.data as { features: unknown[] })
        .features,
    ).toHaveLength(0)
    fireEvent.click(
      screen.getByRole('button', { name: /红一军团攻占黎平县城/ }),
    )
    expect(screen.getByText(/匹配依据：直接匹配/)).toBeInTheDocument()
  })

  it('unions two organizations without duplicating the event and marks direct first', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('checkbox', { name: /中央红军/ }))
    fireEvent.click(
      screen.getByRole('checkbox', { name: /中国工农红军第一军团/ }),
    )

    expect(screen.getByText(/已选 2 项（最多4项）/)).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /红一军团攻占黎平县城/ }),
    ).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: /红一军团攻占黎平县城/ }),
    ).toHaveTextContent('组织匹配：直接匹配')
    expect(
      screen.getByText(/当前共享结果：事件 1，路线段 8/),
    ).toBeInTheDocument()
  })

  it('uses the reference date for current names and honest inactive state', () => {
    render(<App />)
    const date = screen.getByLabelText('参考日期')
    fireEvent.change(date, { target: { value: '1935-07-20' } })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    expect(
      screen.getByRole('checkbox', { name: /中国工农红军第一军团/ }),
    ).toBeInTheDocument()

    fireEvent.change(date, { target: { value: '1935-07-21' } })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    expect(
      screen.getByRole('checkbox', { name: /中国工农红军第一军历史组织/ }),
    ).toBeInTheDocument()

    fireEvent.change(date, { target: { value: '1935-09-22' } })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    expect(
      screen.getByText(/当前日期无有效组织实例；仍可作为历史筛选维度使用/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: /中国工农红军第一军团/ }),
    ).toBeInTheDocument()
  })

  it('clears only the organization filter and restores base inventories without reviving selection', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1935-01-15' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    fireEvent.click(
      screen.getByRole('checkbox', { name: /中国工农红军第一军团/ }),
    )

    fireEvent.click(screen.getByRole('button', { name: '清除部队筛选' }))
    expect(screen.getByLabelText('参考日期')).toHaveValue('1935-01-15')
    expect(screen.getByLabelText('时间状态')).toHaveValue('all')
    expect(
      screen.getByText(/当前共享结果：事件 10，路线段 8/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('intersects organization and time filters without changing time semantics', () => {
    render(<App />)
    fireEvent.click(
      screen.getByRole('checkbox', { name: /中国工农红军第一军团/ }),
    )
    fireEvent.change(screen.getByLabelText('参考日期'), {
      target: { value: '1935-01-15' },
    })
    fireEvent.change(screen.getByLabelText('时间状态'), {
      target: { value: 'current' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用过滤' }))
    expect(
      screen.getByText(/当前共享结果：事件 0，路线段 0/),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/当前筛选组合暂无匹配事件/).length,
    ).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '清除部队筛选' }))
    expect(screen.getByLabelText('时间状态')).toHaveValue('current')
    expect(screen.getByLabelText('参考日期')).toHaveValue('1935-01-15')
    expect(screen.getByText(/事件 1\/10，路线段 1\/8/)).toBeInTheDocument()
  })

  it('derives playback from the organization-filtered event and route sets', () => {
    render(<App />)
    fireEvent.click(
      screen.getByRole('checkbox', { name: /中国工农红军第一军团/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: '开始路线播放' }))
    expect(screen.getByText(/当前事件锚点/)).toHaveTextContent(
      '红一军团攻占黎平县城',
    )
    expect(
      screen.queryByText(/当前路线段.*待核验结构测试路线/),
    ).not.toBeInTheDocument()
  })

  it('cleans route detail, map highlight and playback when organization filtering hides it', async () => {
    render(<App />)
    const map = MockMap.instances.at(-1)
    if (!map) throw new Error('Expected MapLibre mock instance')
    act(() => map.emit('load'))
    fireEvent.click(
      screen.getByRole('button', { name: /待核验结构测试路线A · 路段1/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: '开始路线播放' }))
    fireEvent.click(
      screen.getByRole('checkbox', { name: /中国工农红军第一军团/ }),
    )
    await Promise.resolve()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(map.filters.get(routeLayerIds.selectedLines)).toEqual([
      '==',
      ['get', 'route_segment_id'],
      '__t06_no_selected_route_segment__',
    ])
    expect(
      screen.getByRole('button', { name: '开始路线播放' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除部队筛选' }))
    expect(
      screen.getByRole('button', {
        name: /待核验结构测试路线A · 路段1/,
      }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
