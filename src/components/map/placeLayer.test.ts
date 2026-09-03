import { describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { Map as MockMap, MockGeoJsonSource } from '../../test/maplibreMock'
import type { RenderPlaceCollection } from '../../types/place'
import {
  attachPlaceLayer,
  placeLayerIds,
  registerPlaceLayer,
} from './placeLayer'

const featureCollection: RenderPlaceCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'geom_test',
      properties: {
        place_id: 'place_test',
        display_name: '结构测试地点（待核验）',
        display_name_kind: 'historical-placeholder',
        spatial_precision: 'S1',
        is_representative_point: false,
        sample_notice: '开发样例/待核验占位数据，不得作为正式史实引用',
      },
      geometry: { type: 'Point', coordinates: [104, 35] },
    },
  ],
}

function mapInstance() {
  MockMap.reset()
  const container = document.createElement('div')
  return new MockMap({ container, style: {} } as never)
}

describe('place layer', () => {
  it('registers one GeoJSON source and one Circle layer only once', () => {
    const map = mapInstance()

    registerPlaceLayer(map as unknown as MapLibreMap, featureCollection)
    registerPlaceLayer(map as unknown as MapLibreMap, featureCollection)

    expect(map.sources.size).toBe(1)
    expect(map.layers.size).toBe(1)
    expect(map.layers.get(placeLayerIds.circles)).toMatchObject({
      type: 'circle',
      source: placeLayerIds.source,
    })
    expect(
      (map.sources.get(placeLayerIds.source) as MockGeoJsonSource).setDataCalls,
    ).toHaveLength(1)
  })

  it('registers after online load and re-registers after a style switch', () => {
    const map = mapInstance()
    const detach = attachPlaceLayer(
      map as unknown as MapLibreMap,
      featureCollection,
    )

    map.emit('load')
    expect(map.sources.has(placeLayerIds.source)).toBe(true)

    map.setStyle({ version: 8 })
    expect(map.sources.has(placeLayerIds.source)).toBe(false)
    map.emit('style.load')
    expect(map.sources.has(placeLayerIds.source)).toBe(true)
    expect(map.layers.has(placeLayerIds.circles)).toBe(true)

    detach()
    map.setStyle({ version: 8 })
    map.emit('style.load')
    expect(map.sources.has(placeLayerIds.source)).toBe(false)
  })

  it('accepts an empty collection without crashing', () => {
    const map = mapInstance()

    expect(() =>
      registerPlaceLayer(map as unknown as MapLibreMap, {
        type: 'FeatureCollection',
        features: [],
      }),
    ).not.toThrow()
    expect(map.sources.has(placeLayerIds.source)).toBe(true)
  })

  it('delegates place clicks and removes its listener on detach', () => {
    const map = mapInstance()
    const onSelect = vi.fn()
    const detach = attachPlaceLayer(
      map as unknown as MapLibreMap,
      featureCollection,
      onSelect,
    )

    map.emitLayer('click', placeLayerIds.circles, {
      features: [{ properties: { place_id: 'place_test' } }],
    })
    expect(onSelect).toHaveBeenCalledWith('place_test')

    detach()
    map.emitLayer('click', placeLayerIds.circles, {
      features: [{ properties: { place_id: 'place_test' } }],
    })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
