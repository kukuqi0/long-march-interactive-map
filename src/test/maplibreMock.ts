export type MockMapHandler = (event?: unknown) => void

interface MockMapOptions {
  container: HTMLElement
  style: unknown
}

export class NavigationControl {}

export class AttributionControl {
  constructor(public options?: unknown) {}
}

export class Map {
  static instances: Map[] = []
  static constructorErrors: Error[] = []
  static setStyleError: Error | null = null

  readonly container: HTMLElement
  readonly initialStyle: unknown
  readonly handlers = new globalThis.Map<string, Set<MockMapHandler>>()
  readonly layerHandlers = new globalThis.Map<string, Set<MockMapHandler>>()
  readonly controls: unknown[] = []
  readonly setStyleCalls: unknown[] = []
  readonly sources = new globalThis.Map<string, MockGeoJsonSource>()
  readonly layers = new globalThis.Map<string, unknown>()
  readonly images = new globalThis.Map<string, unknown>()
  readonly filters = new globalThis.Map<string, unknown>()
  readonly paintProperties = new globalThis.Map<
    string,
    globalThis.Map<string, unknown>
  >()
  readonly canvas: HTMLCanvasElement
  removed = false
  resizeCalls = 0

  constructor(options: MockMapOptions) {
    const error = Map.constructorErrors.shift()
    if (error) {
      throw error
    }

    this.container = options.container
    this.initialStyle = options.style
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'maplibregl-canvas'
    this.container.appendChild(this.canvas)
    Map.instances.push(this)
  }

  static reset() {
    Map.instances = []
    Map.constructorErrors = []
    Map.setStyleError = null
  }

  on(
    eventName: string,
    layerOrHandler: string | MockMapHandler,
    delegatedHandler?: MockMapHandler,
  ) {
    const key =
      typeof layerOrHandler === 'string'
        ? `${eventName}:${layerOrHandler}`
        : eventName
    const collection =
      typeof layerOrHandler === 'string' ? this.layerHandlers : this.handlers
    const handler =
      typeof layerOrHandler === 'string' ? delegatedHandler : layerOrHandler
    if (!handler) {
      return this
    }
    const handlers = collection.get(key) ?? new Set<MockMapHandler>()
    handlers.add(handler)
    collection.set(key, handlers)
    return this
  }

  off(
    eventName: string,
    layerOrHandler: string | MockMapHandler,
    delegatedHandler?: MockMapHandler,
  ) {
    const key =
      typeof layerOrHandler === 'string'
        ? `${eventName}:${layerOrHandler}`
        : eventName
    const collection =
      typeof layerOrHandler === 'string' ? this.layerHandlers : this.handlers
    const handler =
      typeof layerOrHandler === 'string' ? delegatedHandler : layerOrHandler
    if (handler) {
      collection.get(key)?.delete(handler)
    }
    return this
  }

  emit(eventName: string, event: unknown = {}) {
    this.handlers.get(eventName)?.forEach((handler) => handler(event))
  }

  emitLayer(eventName: string, layerId: string, event: unknown = {}) {
    this.layerHandlers
      .get(`${eventName}:${layerId}`)
      ?.forEach((handler) => handler(event))
  }

  addControl(control: unknown) {
    this.controls.push(control)
    return this
  }

  removeControl(control: unknown) {
    const index = this.controls.indexOf(control)
    if (index >= 0) {
      this.controls.splice(index, 1)
    }
    return this
  }

  setStyle(style: unknown) {
    if (Map.setStyleError) {
      throw Map.setStyleError
    }
    this.setStyleCalls.push(style)
    this.sources.clear()
    this.layers.clear()
    this.images.clear()
    this.filters.clear()
    this.paintProperties.clear()
    return this
  }

  getSource(id: string) {
    return this.sources.get(id)
  }

  addSource(id: string, specification: { data?: unknown }) {
    this.sources.set(id, new MockGeoJsonSource(specification.data))
    return this
  }

  getLayer(id: string) {
    return this.layers.get(id)
  }

  addLayer(layer: {
    id: string
    filter?: unknown
    paint?: Record<string, unknown>
  }) {
    this.layers.set(layer.id, layer)
    if (layer.filter !== undefined) this.filters.set(layer.id, layer.filter)
    if (layer.paint) {
      this.paintProperties.set(
        layer.id,
        new globalThis.Map(Object.entries(layer.paint)),
      )
    }
    return this
  }

  setFilter(layerId: string, filter: unknown) {
    this.filters.set(layerId, filter)
    return this
  }

  setPaintProperty(layerId: string, property: string, value: unknown) {
    const properties = this.paintProperties.get(layerId) ?? new globalThis.Map()
    properties.set(property, value)
    this.paintProperties.set(layerId, properties)
    return this
  }

  hasImage(id: string) {
    return this.images.has(id)
  }

  addImage(id: string, image: unknown) {
    this.images.set(id, image)
    return this
  }

  resize() {
    this.resizeCalls += 1
    return this
  }

  remove() {
    this.removed = true
    this.canvas.remove()
  }
}

export class MockGeoJsonSource {
  readonly setDataCalls: unknown[] = []

  constructor(public data: unknown) {}

  setData(data: unknown) {
    this.data = data
    this.setDataCalls.push(data)
  }
}
