import type {
  FilterSpecification,
  Map as MapLibreMap,
  MapMouseEvent,
} from 'maplibre-gl'
import type { RenderEventCollection } from '../../types/event'
import { registerEventIcons } from './eventIcons'

export const eventLayerIds = {
  source: 't05-sample-events',
  symbols: 't05-sample-event-symbols',
  selected: 't05-sample-event-selected',
} as const

const noSelection = '__t05_no_selected_event__'

function selectionFilter(selectedEventId: string | null): FilterSpecification {
  return ['==', ['get', 'event_id'], selectedEventId ?? noSelection]
}

export function registerEventLayer(
  map: MapLibreMap,
  featureCollection: RenderEventCollection,
  selectedEventId: string | null,
) {
  registerEventIcons(map)

  const existingSource = map.getSource(eventLayerIds.source)
  if (existingSource) {
    const setData = Reflect.get(existingSource, 'setData')
    if (typeof setData === 'function') {
      setData.call(existingSource, featureCollection)
    }
  } else {
    map.addSource(eventLayerIds.source, {
      type: 'geojson',
      data: featureCollection,
    })
  }

  if (!map.getLayer(eventLayerIds.symbols)) {
    map.addLayer({
      id: eventLayerIds.symbols,
      type: 'symbol',
      source: eventLayerIds.source,
      layout: {
        'icon-image': ['get', 'icon_id'],
        'icon-anchor': 'bottom',
        'icon-offset': [0, -4],
        'icon-allow-overlap': true,
      },
    })
  }
  if (!map.getLayer(eventLayerIds.selected)) {
    map.addLayer({
      id: eventLayerIds.selected,
      type: 'symbol',
      source: eventLayerIds.source,
      filter: selectionFilter(selectedEventId),
      layout: {
        'icon-image': ['get', 'selected_icon_id'],
        'icon-anchor': 'bottom',
        'icon-offset': [0, -4],
        'icon-allow-overlap': true,
      },
    })
  } else {
    map.setFilter(eventLayerIds.selected, selectionFilter(selectedEventId))
  }
}

interface EventMapClick extends MapMouseEvent {
  features?: Array<{
    id?: string | number
    properties?: Record<string, unknown>
  }>
}

export interface EventLayerController {
  setSelected: (eventId: string | null) => void
  setData: (featureCollection: RenderEventCollection) => void
  detach: () => void
}

export function attachEventLayer(
  map: MapLibreMap,
  featureCollection: RenderEventCollection,
  initialSelectedEventId: string | null,
  onSelectEvent: (eventId: string) => void,
): EventLayerController {
  let selectedEventId = initialSelectedEventId
  let currentFeatureCollection = featureCollection
  const register = () =>
    registerEventLayer(map, currentFeatureCollection, selectedEventId)
  const handleClick = (event: EventMapClick) => {
    const feature = event.features?.[0]
    const eventId = feature?.properties?.event_id ?? feature?.id
    if (typeof eventId === 'string') {
      onSelectEvent(eventId)
    }
  }

  map.on('load', register)
  map.on('style.load', register)
  map.on('click', eventLayerIds.symbols, handleClick)

  return {
    setSelected(eventId) {
      selectedEventId = eventId
      if (map.getLayer(eventLayerIds.selected)) {
        map.setFilter(eventLayerIds.selected, selectionFilter(eventId))
      }
    },
    setData(nextFeatureCollection) {
      currentFeatureCollection = nextFeatureCollection
      if (map.getSource(eventLayerIds.source)) register()
    },
    detach() {
      map.off('load', register)
      map.off('style.load', register)
      map.off('click', eventLayerIds.symbols, handleClick)
    },
  }
}
