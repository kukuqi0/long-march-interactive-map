import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import type { RenderPlaceCollection } from '../../types/place'

export const placeLayerIds = {
  source: 't04-sample-places',
  circles: 't04-sample-place-circles',
} as const

export function registerPlaceLayer(
  map: MapLibreMap,
  featureCollection: RenderPlaceCollection,
) {
  const existingSource = map.getSource(placeLayerIds.source)
  if (existingSource) {
    const setData = Reflect.get(existingSource, 'setData')
    if (typeof setData === 'function') {
      setData.call(existingSource, featureCollection)
    }
  } else {
    map.addSource(placeLayerIds.source, {
      type: 'geojson',
      data: featureCollection,
    })
  }

  if (!map.getLayer(placeLayerIds.circles)) {
    map.addLayer({
      id: placeLayerIds.circles,
      type: 'circle',
      source: placeLayerIds.source,
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'is_representative_point'], true],
          8,
          6,
        ],
        'circle-color': [
          'case',
          ['==', ['get', 'is_representative_point'], true],
          '#f6e2a2',
          '#9f2d24',
        ],
        'circle-opacity': [
          'case',
          ['==', ['get', 'is_representative_point'], true],
          0.72,
          0.9,
        ],
        'circle-stroke-color': '#4e201b',
        'circle-stroke-width': [
          'case',
          ['==', ['get', 'is_representative_point'], true],
          3,
          1.5,
        ],
      },
    })
  }
}

export function attachPlaceLayer(
  map: MapLibreMap,
  featureCollection: RenderPlaceCollection,
  onSelectPlace?: (placeId: string) => void,
) {
  const register = () => registerPlaceLayer(map, featureCollection)
  const selectPlace = (
    event: MapMouseEvent & {
      features?: Array<{ properties?: Record<string, unknown> }>
    },
  ) => {
    const placeId = event.features?.[0]?.properties?.place_id
    if (typeof placeId === 'string') onSelectPlace?.(placeId)
  }
  map.on('load', register)
  map.on('style.load', register)
  if (onSelectPlace) map.on('click', placeLayerIds.circles, selectPlace)

  return () => {
    map.off('load', register)
    map.off('style.load', register)
    if (onSelectPlace) map.off('click', placeLayerIds.circles, selectPlace)
  }
}
