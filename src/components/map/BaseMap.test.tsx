/// <reference types="node" />

import { act, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { mapConfig } from '../../config/map'
import { Map as MockMap } from '../../test/maplibreMock'
import { BaseMap } from './BaseMap'
import { loadT05EventDataset } from '../../data/loaders/loadEvents'
import { loadT04PlaceDataset } from '../../data/loaders/loadPlaces'
import { loadT06PreOrganizationDataset } from '../../data/loaders/loadOrganizations'
import { loadT06RouteDataset } from '../../data/loaders/loadRoutes'
import { eventLayerIds } from './eventLayer'
import { placeLayerIds } from './placeLayer'
import { routeLayerIds } from './routeLayer'

vi.mock('maplibre-gl', async () => import('../../test/maplibreMock'))

function currentMap() {
  const instance = MockMap.instances.at(-1)
  if (!instance) {
    throw new Error('Expected a MapLibre mock instance')
  }
  return instance
}

function emitMapError(message: string, extra: Record<string, unknown> = {}) {
  act(() => {
    currentMap().emit('error', { error: new Error(message), ...extra })
  })
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? sourceFiles(path) : [path]
  })
}

describe('base map', () => {
  beforeEach(() => {
    MockMap.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders an accessible map container in loading state', () => {
    render(<BaseMap />)

    expect(
      screen.getByRole('region', {
        name: '地图，可使用键盘或指针缩放和平移',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('地图加载中')
    expect(currentMap().canvas).toBeInTheDocument()
  })

  it('enters online state after the map load event', () => {
    render(<BaseMap placeDataset={loadT04PlaceDataset()} />)

    act(() => currentMap().emit('load'))

    expect(screen.getByRole('status')).toHaveTextContent('在线底图')
    expect(currentMap().controls).toHaveLength(2)
    expect(currentMap().sources.has(placeLayerIds.source)).toBe(true)
  })

  it('falls back to the local blank style when the online style fails', () => {
    render(<BaseMap placeDataset={loadT04PlaceDataset()} />)

    emitMapError('Online style failed to load')

    expect(screen.getByRole('status')).toHaveTextContent(
      '底图暂不可用，已切换为无底图模式',
    )
    expect(currentMap().setStyleCalls).toEqual([mapConfig.blankStyle])

    act(() => currentMap().emit('style.load'))
    expect(currentMap().sources.has(placeLayerIds.source)).toBe(true)
  })

  it('keeps the base map available when place data validation failed', () => {
    const failedDataset = {
      ...loadT04PlaceDataset(),
      ok: false,
      featureCollection: { type: 'FeatureCollection' as const, features: [] },
    }

    render(<BaseMap placeDataset={failedDataset} />)
    act(() => currentMap().emit('load'))

    expect(screen.getByRole('status')).toHaveTextContent('在线底图')
    expect(currentMap().sources.has(placeLayerIds.source)).toBe(true)
  })

  it('restores places, events and routes after blank-style fallback', () => {
    const places = loadT04PlaceDataset()
    const events = loadT05EventDataset(places)
    const routes = loadT06RouteDataset(places, loadT06PreOrganizationDataset())
    render(
      <BaseMap
        placeDataset={places}
        eventDataset={events}
        selectedEventId={null}
        onSelectEvent={vi.fn()}
        routeDataset={routes}
        selectedRouteSegmentId={null}
        onSelectRouteSegment={vi.fn()}
      />,
    )

    act(() => currentMap().emit('load'))
    expect(currentMap().sources.has(placeLayerIds.source)).toBe(true)
    expect(currentMap().sources.has(eventLayerIds.source)).toBe(true)
    expect(currentMap().sources.has(routeLayerIds.source)).toBe(true)

    emitMapError('Online style failed to load')
    act(() => currentMap().emit('style.load'))

    expect(currentMap().sources.has(placeLayerIds.source)).toBe(true)
    expect(currentMap().sources.has(eventLayerIds.source)).toBe(true)
    expect(currentMap().sources.has(routeLayerIds.source)).toBe(true)
    expect(currentMap().layers.has(eventLayerIds.symbols)).toBe(true)
    expect(currentMap().layers.has(routeLayerIds.r4)).toBe(true)
  })

  it.each([
    ['source', { sourceId: 'openmaptiles' }],
    ['tile', { tile: { id: 'sample' } }],
    ['glyph', {}],
    ['sprite', {}],
  ])('degrades after repeated critical %s failures', (kind, extra) => {
    render(<BaseMap />)

    emitMapError(`${kind} resource failed`, extra)
    emitMapError(`${kind} resource failed again`, extra)

    expect(screen.getByRole('status')).toHaveTextContent(
      '底图暂不可用，已切换为无底图模式',
    )
    expect(currentMap().setStyleCalls).toHaveLength(1)
  })

  it('keeps the online map after one isolated resource error', () => {
    render(<BaseMap />)
    act(() => currentMap().emit('load'))

    emitMapError('tile resource failed once', { tile: { id: 'sample' } })

    expect(screen.getByRole('status')).toHaveTextContent('在线底图')
    expect(screen.getByRole('status')).toHaveTextContent(
      '部分在线底图资源暂时不可用',
    )
    expect(currentMap().setStyleCalls).toHaveLength(0)
  })

  it('falls back after the controlled online load timeout', () => {
    vi.useFakeTimers()
    render(<BaseMap />)

    act(() => {
      vi.advanceTimersByTime(mapConfig.errorPolicy.onlineLoadTimeoutMs)
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      '底图暂不可用，已切换为无底图模式',
    )
  })

  it('enters fatal state only when online and blank map initialization fail', () => {
    MockMap.constructorErrors = [
      new Error('WebGL unavailable'),
      new Error('WebGL unavailable for blank style'),
    ]

    render(<BaseMap />)

    expect(screen.getByRole('status')).toHaveTextContent('地图组件暂不可用')
    expect(screen.getByRole('status')).toHaveTextContent(
      'MapLibre或WebGL初始化失败，且本地空白底图不可用。',
    )
  })

  it('enters fatal state when switching to the local blank style throws', () => {
    MockMap.setStyleError = new Error('blank style failed')
    render(<BaseMap />)

    emitMapError('Online style failed to load')

    expect(screen.getByRole('status')).toHaveTextContent('地图组件暂不可用')
  })

  it('removes the map instance when unmounted', () => {
    const { unmount } = render(<BaseMap />)
    const map = currentMap()

    unmount()

    expect(map.removed).toBe(true)
  })

  it('resizes the existing map instance when its responsive container changes', () => {
    let triggerResize: () => void = () => undefined
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        triggerResize = () => callback([], this as unknown as ResizeObserver)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    const originalResizeObserver = globalThis.ResizeObserver
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: TestResizeObserver,
    })

    try {
      render(<BaseMap />)
      const map = currentMap()
      act(() => map.emit('load'))
      act(() => triggerResize())

      expect(map.resizeCalls).toBe(1)
      expect(MockMap.instances).toHaveLength(1)
    } finally {
      Object.defineProperty(globalThis, 'ResizeObserver', {
        configurable: true,
        value: originalResizeObserver,
      })
    }
  })

  it('cleans the first instance during React strict-mode remounting', () => {
    render(
      <StrictMode>
        <BaseMap />
      </StrictMode>,
    )

    expect(MockMap.instances).toHaveLength(2)
    expect(MockMap.instances[0].removed).toBe(true)
    expect(MockMap.instances[1].removed).toBe(false)
  })

  it('does not request browser geolocation', () => {
    const getCurrentPosition = vi.fn()
    const originalGeolocation = navigator.geolocation
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    })

    render(<BaseMap />)

    expect(getCurrentPosition).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    })
  })

  it('defines the online style URL in the centralized config only', () => {
    const srcRoot = join(process.cwd(), 'src')
    const matches = sourceFiles(srcRoot)
      .filter((path) => /\.(css|json|ts|tsx)$/.test(path))
      .flatMap((path) => {
        const occurrences =
          readFileSync(path, 'utf8').split(mapConfig.provider.styleUrl).length -
          1
        return occurrences > 0
          ? [{ path: relative(process.cwd(), path), occurrences }]
          : []
      })

    expect(matches).toEqual([
      { path: join('src', 'config', 'map.ts'), occurrences: 1 },
    ])
  })
})
