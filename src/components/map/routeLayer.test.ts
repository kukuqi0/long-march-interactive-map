import type { Map as MapLibreMap } from 'maplibre-gl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadT06PreOrganizationDataset } from '../../data/loaders/loadOrganizations'
import { loadT04PlaceDataset } from '../../data/loaders/loadPlaces'
import { loadT06RouteDataset } from '../../data/loaders/loadRoutes'
import { Map as MockMap, MockGeoJsonSource } from '../../test/maplibreMock'
import { eventLayerIds } from './eventLayer'
import { placeLayerIds, registerPlaceLayer } from './placeLayer'
import {
  attachRouteLayer,
  registerRouteLayer,
  routeLayerIds,
} from './routeLayer'

const places = loadT04PlaceDataset()
const routes = loadT06RouteDataset(places, loadT06PreOrganizationDataset())

function createMap() {
  return new MockMap({ container: document.createElement('div'), style: {} })
}

function asMap(map: MockMap) {
  return map as unknown as MapLibreMap
}

describe('MapLibre route layer', () => {
  beforeEach(() => MockMap.reset())

  it('keeps route IDs independent from place and event IDs', () => {
    expect(routeLayerIds.source).not.toBe(placeLayerIds.source)
    expect(routeLayerIds.source).not.toBe(eventLayerIds.source)
    expect(new Set(Object.values(routeLayerIds)).size).toBe(
      Object.values(routeLayerIds).length,
    )
  })

  it('registers one source and certainty layers idempotently', () => {
    const map = createMap()
    registerRouteLayer(asMap(map), routes.featureCollection, null)
    registerRouteLayer(asMap(map), routes.featureCollection, null)

    expect(map.sources).toHaveLength(1)
    expect(map.layers).toHaveLength(Object.keys(routeLayerIds).length - 1)
    expect(
      (map.sources.get(routeLayerIds.source) as MockGeoJsonSource).setDataCalls,
    ).toHaveLength(1)
    expect(map.layers.get(routeLayerIds.r1)).toMatchObject({
      type: 'line',
      paint: { 'line-width': 5 },
    })
    expect(map.layers.get(routeLayerIds.r2)).toMatchObject({
      paint: { 'line-dasharray': [4, 3] },
    })
    expect(map.layers.get(routeLayerIds.r3Fill)).toMatchObject({
      type: 'fill',
      paint: { 'fill-opacity': 0.3 },
    })
    expect(map.layers.get(routeLayerIds.r4)).toMatchObject({
      paint: { 'line-dasharray': [3, 1, 1, 1] },
    })
  })

  it('contains no R5 or RU connection geometry and preserves explicit gaps', () => {
    expect(
      routes.featureCollection.features.some((feature) =>
        ['R5', 'RU'].includes(feature.properties.route_certainty),
      ),
    ).toBe(false)
    expect(routes.unmapped.map((item) => item.route_segment_id)).toEqual(
      expect.arrayContaining([
        'seg_t06_r5_placeholder',
        'seg_t06_ru_placeholder',
      ]),
    )
    expect(routes.featureCollection.features).toHaveLength(7)
  })

  it('re-registers the same source after a style reload without duplicates', () => {
    const map = createMap()
    registerPlaceLayer(asMap(map), places.featureCollection)
    const controller = attachRouteLayer(
      asMap(map),
      routes.featureCollection,
      null,
      vi.fn(),
    )
    map.emit('load')
    expect(map.sources.has(placeLayerIds.source)).toBe(true)
    expect(map.sources.has(routeLayerIds.source)).toBe(true)

    map.setStyle({ version: 8, sources: {}, layers: [] })
    registerPlaceLayer(asMap(map), places.featureCollection)
    map.emit('style.load')
    expect(map.sources.has(placeLayerIds.source)).toBe(true)
    expect(map.sources.has(routeLayerIds.source)).toBe(true)
    expect(map.layers.has(routeLayerIds.r4)).toBe(true)
    controller.detach()
  })

  it('applies one playback progress to both separated R4 alternatives', () => {
    const map = createMap()
    const r4 = routes.routeSegments.find(
      (segment) => segment.route_certainty === 'R4',
    )!
    const controller = attachRouteLayer(
      asMap(map),
      routes.featureCollection,
      null,
      vi.fn(),
      { routeSegmentId: r4.route_segment_id, progress: 0.5 },
    )
    map.emit('load')

    expect(map.filters.get(routeLayerIds.playbackLines)).toEqual([
      '==',
      ['get', 'route_segment_id'],
      r4.route_segment_id,
    ])
    expect(
      map.paintProperties.get(routeLayerIds.playbackLines)?.get('line-opacity'),
    ).toBeCloseTo(0.19)
    expect(
      routes.featureCollection.features.filter(
        (feature) =>
          feature.properties.route_segment_id === r4.route_segment_id,
      ),
    ).toHaveLength(2)

    controller.setPlayback({ routeSegmentId: null, progress: 0 })
    expect(map.filters.get(routeLayerIds.playbackLines)).toEqual([
      '==',
      ['get', 'route_segment_id'],
      '__t06_no_selected_route_segment__',
    ])
    controller.detach()
  })

  it('restores playback progress after style reload without rebuilding the map', () => {
    const map = createMap()
    const segment = routes.routeSegments.find(
      (item) => item.route_certainty === 'R1',
    )!
    const controller = attachRouteLayer(
      asMap(map),
      routes.featureCollection,
      null,
      vi.fn(),
      { routeSegmentId: segment.route_segment_id, progress: 0.75 },
    )
    map.emit('load')
    map.setStyle({ version: 8, sources: {}, layers: [] })
    map.emit('style.load')

    expect(map.sources.has(routeLayerIds.source)).toBe(true)
    expect(map.filters.get(routeLayerIds.playbackLines)).toEqual([
      '==',
      ['get', 'route_segment_id'],
      segment.route_segment_id,
    ])
    expect(
      map.paintProperties.get(routeLayerIds.playbackLines)?.get('line-opacity'),
    ).toBeCloseTo(0.285)
    expect(MockMap.instances).toHaveLength(1)
    controller.detach()
  })

  it('synchronizes delegated clicks and keeps all R4 alternatives selected', () => {
    const map = createMap()
    const onSelect = vi.fn()
    const controller = attachRouteLayer(
      asMap(map),
      routes.featureCollection,
      null,
      onSelect,
    )
    map.emit('load')
    map.emitLayer('click', routeLayerIds.r4, {
      features: [
        {
          properties: { route_segment_id: 'seg_t06_main_alternative_r4' },
        },
      ],
    })
    expect(onSelect).toHaveBeenCalledWith('seg_t06_main_alternative_r4')

    controller.setSelected('seg_t06_main_alternative_r4')
    const expected = [
      '==',
      ['get', 'route_segment_id'],
      'seg_t06_main_alternative_r4',
    ]
    expect(map.filters.get(routeLayerIds.selectedLines)).toEqual(expected)
    expect(map.filters.get(routeLayerIds.selectedCorridor)).toEqual(expected)
    expect(map).not.toHaveProperty('flyToCalls')
    controller.detach()
  })

  it('cleans load, style and delegated click listeners', () => {
    const map = createMap()
    const onSelect = vi.fn()
    const controller = attachRouteLayer(
      asMap(map),
      routes.featureCollection,
      null,
      onSelect,
    )
    controller.detach()
    map.emit('load')
    map.emit('style.load')
    map.emitLayer('click', routeLayerIds.r1, {
      features: [{ properties: { route_segment_id: 'seg_fixture' } }],
    })
    expect(map.sources).toHaveLength(0)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
