import type {
  FilterSpecification,
  Map as MapLibreMap,
  MapMouseEvent,
} from 'maplibre-gl'
import type { RenderRouteCollection } from '../../types/route'
import type { RoutePlaybackVisualState } from '../../types/playback'

export const routeLayerIds = {
  source: 't06-sample-route-segments',
  r3Fill: 't06-sample-route-r3-fill',
  r3Outline: 't06-sample-route-r3-outline',
  r1Casing: 't06-sample-route-r1-casing',
  r1: 't06-sample-route-r1',
  r2: 't06-sample-route-r2',
  r4: 't06-sample-route-r4',
  selectedLines: 't06-sample-route-selected-lines',
  selectedCorridor: 't06-sample-route-selected-corridor',
  playbackLines: 't10-sample-route-playback-lines',
  playbackCorridor: 't10-sample-route-playback-corridor',
} as const

const noSelection = '__t06_no_selected_route_segment__'
const interactiveLayerIds = [
  routeLayerIds.r1,
  routeLayerIds.r2,
  routeLayerIds.r3Fill,
  routeLayerIds.r4,
] as const

function certaintyFilter(certainty: string): FilterSpecification {
  return ['==', ['get', 'route_certainty'], certainty]
}

function selectionFilter(
  selectedRouteSegmentId: string | null,
): FilterSpecification {
  return [
    '==',
    ['get', 'route_segment_id'],
    selectedRouteSegmentId ?? noSelection,
  ]
}

export function registerRouteLayer(
  map: MapLibreMap,
  featureCollection: RenderRouteCollection,
  selectedRouteSegmentId: string | null,
  playback: RoutePlaybackVisualState = {
    routeSegmentId: null,
    progress: 0,
  },
) {
  const existingSource = map.getSource(routeLayerIds.source)
  if (existingSource) {
    const setData = Reflect.get(existingSource, 'setData')
    if (typeof setData === 'function') {
      setData.call(existingSource, featureCollection)
    }
  } else {
    map.addSource(routeLayerIds.source, {
      type: 'geojson',
      data: featureCollection,
    })
  }

  if (!map.getLayer(routeLayerIds.r3Fill)) {
    map.addLayer({
      id: routeLayerIds.r3Fill,
      type: 'fill',
      source: routeLayerIds.source,
      filter: certaintyFilter('R3'),
      paint: {
        'fill-color': '#c9822f',
        'fill-opacity': 0.3,
      },
    })
  }
  if (!map.getLayer(routeLayerIds.r3Outline)) {
    map.addLayer({
      id: routeLayerIds.r3Outline,
      type: 'line',
      source: routeLayerIds.source,
      filter: certaintyFilter('R3'),
      paint: {
        'line-color': '#6d3a16',
        'line-width': 2,
        'line-dasharray': [1, 2],
        'line-opacity': 0.8,
      },
    })
  }
  if (!map.getLayer(routeLayerIds.r1Casing)) {
    map.addLayer({
      id: routeLayerIds.r1Casing,
      type: 'line',
      source: routeLayerIds.source,
      filter: certaintyFilter('R1'),
      paint: {
        'line-color': '#fff4ce',
        'line-width': 8,
        'line-opacity': 0.95,
      },
    })
  }
  if (!map.getLayer(routeLayerIds.r1)) {
    map.addLayer({
      id: routeLayerIds.r1,
      type: 'line',
      source: routeLayerIds.source,
      filter: certaintyFilter('R1'),
      paint: {
        'line-color': '#8e241d',
        'line-width': 5,
        'line-opacity': 0.9,
      },
    })
  }
  if (!map.getLayer(routeLayerIds.r2)) {
    map.addLayer({
      id: routeLayerIds.r2,
      type: 'line',
      source: routeLayerIds.source,
      filter: certaintyFilter('R2'),
      paint: {
        'line-color': '#74431d',
        'line-width': 4,
        'line-dasharray': [4, 3],
        'line-opacity': 0.75,
      },
    })
  }
  if (!map.getLayer(routeLayerIds.r4)) {
    map.addLayer({
      id: routeLayerIds.r4,
      type: 'line',
      source: routeLayerIds.source,
      filter: certaintyFilter('R4'),
      paint: {
        'line-color': [
          'match',
          ['get', 'alternative_id'],
          'A',
          '#69318c',
          'B',
          '#17636e',
          '#4f4f4f',
        ],
        'line-width': 4,
        'line-dasharray': [3, 1, 1, 1],
        'line-opacity': 0.65,
      },
    })
  }

  const selectedFilter = selectionFilter(selectedRouteSegmentId)
  if (!map.getLayer(routeLayerIds.selectedLines)) {
    map.addLayer({
      id: routeLayerIds.selectedLines,
      type: 'line',
      source: routeLayerIds.source,
      filter: selectedFilter,
      paint: {
        'line-color': '#15130f',
        'line-width': 9,
        'line-opacity': 0.35,
      },
    })
  } else {
    map.setFilter(routeLayerIds.selectedLines, selectedFilter)
  }
  if (!map.getLayer(routeLayerIds.selectedCorridor)) {
    map.addLayer({
      id: routeLayerIds.selectedCorridor,
      type: 'fill',
      source: routeLayerIds.source,
      filter: selectedFilter,
      paint: {
        'fill-color': '#15130f',
        'fill-opacity': 0.18,
        'fill-outline-color': '#15130f',
      },
    })
  } else {
    map.setFilter(routeLayerIds.selectedCorridor, selectedFilter)
  }

  const playbackFilter = selectionFilter(playback.routeSegmentId)
  const playbackOpacity = Math.max(0, Math.min(1, playback.progress))
  if (!map.getLayer(routeLayerIds.playbackLines)) {
    map.addLayer({
      id: routeLayerIds.playbackLines,
      type: 'line',
      source: routeLayerIds.source,
      filter: playbackFilter,
      paint: {
        'line-color': '#f5c04a',
        'line-width': 10,
        'line-opacity': playbackOpacity * 0.38,
      },
    })
  } else {
    map.setFilter(routeLayerIds.playbackLines, playbackFilter)
    map.setPaintProperty(
      routeLayerIds.playbackLines,
      'line-opacity',
      playbackOpacity * 0.38,
    )
  }
  if (!map.getLayer(routeLayerIds.playbackCorridor)) {
    map.addLayer({
      id: routeLayerIds.playbackCorridor,
      type: 'fill',
      source: routeLayerIds.source,
      filter: playbackFilter,
      paint: {
        'fill-color': '#f5c04a',
        'fill-opacity': playbackOpacity * 0.22,
        'fill-outline-color': '#6c4b00',
      },
    })
  } else {
    map.setFilter(routeLayerIds.playbackCorridor, playbackFilter)
    map.setPaintProperty(
      routeLayerIds.playbackCorridor,
      'fill-opacity',
      playbackOpacity * 0.22,
    )
  }
}

interface RouteMapClick extends MapMouseEvent {
  features?: Array<{
    properties?: Record<string, unknown>
  }>
}

export interface RouteLayerController {
  setSelected: (routeSegmentId: string | null) => void
  setPlayback: (playback: RoutePlaybackVisualState) => void
  setData: (featureCollection: RenderRouteCollection) => void
  detach: () => void
}

export function attachRouteLayer(
  map: MapLibreMap,
  featureCollection: RenderRouteCollection,
  initialSelectedRouteSegmentId: string | null,
  onSelectRouteSegment: (routeSegmentId: string) => void,
  initialPlayback: RoutePlaybackVisualState = {
    routeSegmentId: null,
    progress: 0,
  },
): RouteLayerController {
  let selectedRouteSegmentId = initialSelectedRouteSegmentId
  let playback = initialPlayback
  let currentFeatureCollection = featureCollection
  const register = () =>
    registerRouteLayer(
      map,
      currentFeatureCollection,
      selectedRouteSegmentId,
      playback,
    )
  const handleClick = (event: RouteMapClick) => {
    const routeSegmentId = event.features?.[0]?.properties?.route_segment_id
    if (typeof routeSegmentId === 'string') {
      onSelectRouteSegment(routeSegmentId)
    }
  }

  map.on('load', register)
  map.on('style.load', register)
  for (const layerId of interactiveLayerIds) {
    map.on('click', layerId, handleClick)
  }

  return {
    setSelected(routeSegmentId) {
      selectedRouteSegmentId = routeSegmentId
      const filter = selectionFilter(routeSegmentId)
      if (map.getLayer(routeLayerIds.selectedLines)) {
        map.setFilter(routeLayerIds.selectedLines, filter)
      }
      if (map.getLayer(routeLayerIds.selectedCorridor)) {
        map.setFilter(routeLayerIds.selectedCorridor, filter)
      }
    },
    setPlayback(nextPlayback) {
      playback = nextPlayback
      const filter = selectionFilter(playback.routeSegmentId)
      const progress = Math.max(0, Math.min(1, playback.progress))
      if (map.getLayer(routeLayerIds.playbackLines)) {
        map.setFilter(routeLayerIds.playbackLines, filter)
        map.setPaintProperty(
          routeLayerIds.playbackLines,
          'line-opacity',
          progress * 0.38,
        )
      }
      if (map.getLayer(routeLayerIds.playbackCorridor)) {
        map.setFilter(routeLayerIds.playbackCorridor, filter)
        map.setPaintProperty(
          routeLayerIds.playbackCorridor,
          'fill-opacity',
          progress * 0.22,
        )
      }
    },
    setData(nextFeatureCollection) {
      currentFeatureCollection = nextFeatureCollection
      if (map.getSource(routeLayerIds.source)) register()
    },
    detach() {
      map.off('load', register)
      map.off('style.load', register)
      for (const layerId of interactiveLayerIds) {
        map.off('click', layerId, handleClick)
      }
    },
  }
}
