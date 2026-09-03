import type { Map as MapLibreMap } from 'maplibre-gl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadT05EventDataset } from '../../data/loaders/loadEvents'
import { loadT04PlaceDataset } from '../../data/loaders/loadPlaces'
import { Map as MockMap } from '../../test/maplibreMock'
import { eventTypePresentation, eventTypes } from '../../types/event'
import { createEventIcon } from './eventIcons'
import {
  attachEventLayer,
  eventLayerIds,
  registerEventLayer,
} from './eventLayer'
import { placeLayerIds, registerPlaceLayer } from './placeLayer'

const places = loadT04PlaceDataset()
const events = loadT05EventDataset(places)

function createMap() {
  const container = document.createElement('div')
  return new MockMap({ container, style: {} })
}

function asMap(map: MockMap) {
  return map as unknown as MapLibreMap
}

describe('local event icons', () => {
  it('freezes a label, local icon ID and distinct shape for all nine types', () => {
    expect(Object.keys(eventTypePresentation)).toEqual([...eventTypes])
    expect(
      new Set(eventTypes.map((type) => eventTypePresentation[type].shape)).size,
    ).toBe(9)
    expect(
      eventTypes.every((type) =>
        eventTypePresentation[type].iconId.startsWith('t05-event-'),
      ),
    ).toBe(true)
  })

  it('generates nine non-identical local pixel shapes without external assets', () => {
    const signatures = eventTypes.map((type) =>
      Array.from(createEventIcon(type).data).join(','),
    )
    expect(new Set(signatures).size).toBe(9)
  })

  it('adds a larger high-contrast ring for selection', () => {
    const normal = createEventIcon('meeting')
    const selected = createEventIcon('meeting', true)
    expect(selected.width).toBeGreaterThan(normal.width)
    expect(selected.data).not.toEqual(normal.data)
  })
})

describe('MapLibre event layer', () => {
  beforeEach(() => MockMap.reset())

  it('uses IDs independent from the place source and layer', () => {
    expect(eventLayerIds.source).not.toBe(placeLayerIds.source)
    expect(eventLayerIds.symbols).not.toBe(placeLayerIds.circles)
  })

  it('registers icons before one event source and its symbol layers', () => {
    const map = createMap()
    registerEventLayer(asMap(map), events.featureCollection, null)

    expect(map.images).toHaveLength(18)
    expect(map.sources.has(eventLayerIds.source)).toBe(true)
    expect(map.layers.has(eventLayerIds.symbols)).toBe(true)
    expect(map.layers.has(eventLayerIds.selected)).toBe(true)
  })

  it('keeps place and event sources together in online and blank styles', () => {
    const map = createMap()
    registerPlaceLayer(asMap(map), places.featureCollection)
    const controller = attachEventLayer(
      asMap(map),
      events.featureCollection,
      null,
      vi.fn(),
    )
    map.emit('load')

    expect(map.sources.has(placeLayerIds.source)).toBe(true)
    expect(map.sources.has(eventLayerIds.source)).toBe(true)

    map.setStyle({ version: 8, sources: {}, layers: [] })
    registerPlaceLayer(asMap(map), places.featureCollection)
    map.emit('style.load')

    expect(map.sources.has(placeLayerIds.source)).toBe(true)
    expect(map.sources.has(eventLayerIds.source)).toBe(true)
    expect(map.layers.has(eventLayerIds.symbols)).toBe(true)
    controller.detach()
  })

  it('registers idempotently across repeated style events', () => {
    const map = createMap()
    const controller = attachEventLayer(
      asMap(map),
      events.featureCollection,
      null,
      vi.fn(),
    )
    map.emit('load')
    map.emit('load')

    expect(map.sources).toHaveLength(1)
    expect(map.layers).toHaveLength(2)
    expect(map.images).toHaveLength(18)
    controller.detach()
  })

  it('sends stable event IDs from delegated map clicks', () => {
    const map = createMap()
    const onSelect = vi.fn()
    const controller = attachEventLayer(
      asMap(map),
      events.featureCollection,
      null,
      onSelect,
    )
    map.emitLayer('click', eventLayerIds.symbols, {
      features: [
        {
          id: 'event_t05_battle_placeholder',
          properties: { event_id: 'event_t05_battle_placeholder' },
        },
      ],
    })
    expect(onSelect).toHaveBeenCalledWith('event_t05_battle_placeholder')
    controller.detach()
  })

  it('updates a non-color selected-icon filter without camera navigation', () => {
    const map = createMap()
    const controller = attachEventLayer(
      asMap(map),
      events.featureCollection,
      null,
      vi.fn(),
    )
    map.emit('load')
    controller.setSelected('event_t05_meeting_placeholder')

    expect(map.filters.get(eventLayerIds.selected)).toEqual([
      '==',
      ['get', 'event_id'],
      'event_t05_meeting_placeholder',
    ])
    expect(map).not.toHaveProperty('flyToCalls')
    controller.detach()
  })

  it('cleans load, style and delegated click listeners', () => {
    const map = createMap()
    const onSelect = vi.fn()
    const controller = attachEventLayer(
      asMap(map),
      events.featureCollection,
      null,
      onSelect,
    )
    controller.detach()
    map.emit('load')
    map.emit('style.load')
    map.emitLayer('click', eventLayerIds.symbols, {
      features: [{ properties: { event_id: 'event_fixture' } }],
    })

    expect(map.sources).toHaveLength(0)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
