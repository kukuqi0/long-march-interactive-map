import { useEffect, useRef, useState } from 'react'
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  type ErrorEvent,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { mapConfig, type MapStatus } from '../../config/map'
import type { LoadedEventDataset } from '../../types/event'
import type { LoadedPlaceDataset } from '../../types/place'
import type { LoadedRouteDataset } from '../../types/route'
import type { OpenDetail } from '../../types/detail'
import type { RoutePlaybackVisualState } from '../../types/playback'
import { attachEventLayer, type EventLayerController } from './eventLayer'
import { attachPlaceLayer } from './placeLayer'
import { attachRouteLayer, type RouteLayerController } from './routeLayer'
import './BaseMap.css'

type ResourceErrorKind =
  'style' | 'source' | 'tile' | 'glyph' | 'sprite' | 'webgl' | 'other'

interface MapResourceErrorEvent extends ErrorEvent {
  sourceId?: string
  tile?: unknown
}

interface VisibleMapState {
  status: MapStatus
  detail?: string
}

function classifyMapError(event: MapResourceErrorEvent): ResourceErrorKind {
  const message = event.error?.message.toLowerCase() ?? ''

  if (message.includes('webgl') || message.includes('context lost')) {
    return 'webgl'
  }
  if (message.includes('sprite')) {
    return 'sprite'
  }
  if (message.includes('glyph') || message.includes('font')) {
    return 'glyph'
  }
  if (event.tile || message.includes('tile')) {
    return 'tile'
  }
  if (event.sourceId || message.includes('source')) {
    return 'source'
  }
  if (
    message.includes('style') ||
    message.includes(mapConfig.provider.styleUrl.toLowerCase())
  ) {
    return 'style'
  }

  return 'other'
}

interface BaseMapProps {
  placeDataset?: LoadedPlaceDataset
  eventDataset?: LoadedEventDataset
  selectedEventId?: string | null
  onSelectEvent?: (eventId: string) => void
  routeDataset?: LoadedRouteDataset
  selectedRouteSegmentId?: string | null
  routePlayback?: RoutePlaybackVisualState
  onSelectRouteSegment?: (routeSegmentId: string) => void
  onOpenDetail?: OpenDetail
}

export function BaseMap({
  placeDataset,
  eventDataset,
  selectedEventId = null,
  onSelectEvent,
  routeDataset,
  selectedRouteSegmentId = null,
  routePlayback = { routeSegmentId: null, progress: 0 },
  onSelectRouteSegment,
  onOpenDetail,
}: BaseMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const eventLayerControllerRef = useRef<EventLayerController | null>(null)
  const routeLayerControllerRef = useRef<RouteLayerController | null>(null)
  const initialEventDatasetRef = useRef(eventDataset)
  const initialRouteDatasetRef = useRef(routeDataset)
  const initialRoutePlaybackRef = useRef(routePlayback)
  const [visibleState, setVisibleState] = useState<VisibleMapState>({
    status: 'loading',
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    let disposed = false
    let map: MapLibreMap | null = null
    let resizeObserver: ResizeObserver | null = null
    let detachPlaceLayer: (() => void) | null = null
    let eventLayerController: EventLayerController | null = null
    let routeLayerController: RouteLayerController | null = null
    let loadTimeout: number | undefined
    let degraded = false
    let attributionAdded = false
    let criticalResourceErrors = 0

    const attributionControl = new AttributionControl({
      compact: true,
      customAttribution: mapConfig.provider.attributionHtml,
    })

    const clearLoadTimeout = () => {
      if (loadTimeout !== undefined) {
        window.clearTimeout(loadTimeout)
        loadTimeout = undefined
      }
    }

    const removeOnlineAttribution = () => {
      if (map && attributionAdded) {
        map.removeControl(attributionControl)
        attributionAdded = false
      }
    }

    const enterFatalState = (detail: string) => {
      clearLoadTimeout()
      removeOnlineAttribution()
      setVisibleState({ status: 'fatal', detail })
    }

    const enterDegradedState = (detail: string) => {
      if (disposed || degraded || !map) {
        return
      }

      degraded = true
      clearLoadTimeout()
      removeOnlineAttribution()

      try {
        map.setStyle(mapConfig.blankStyle as StyleSpecification)
        setVisibleState({ status: 'degraded', detail })
      } catch {
        enterFatalState('在线底图和本地空白底图均无法初始化。')
      }
    }

    const enterOnlineState = () => {
      if (disposed || degraded || !map) {
        return
      }

      clearLoadTimeout()
      if (!attributionAdded) {
        map.addControl(attributionControl, 'bottom-right')
        attributionAdded = true
      }
      setVisibleState({ status: 'online' })
    }

    const handleLoad = () => {
      if (degraded) {
        setVisibleState({
          status: 'degraded',
          detail: mapConfig.messages.blankMode,
        })
      } else {
        enterOnlineState()
      }
    }

    const handleError = (event: MapResourceErrorEvent) => {
      const kind = classifyMapError(event)

      if (degraded) {
        if (kind === 'style' || kind === 'webgl') {
          enterFatalState('本地空白底图无法继续运行。')
        }
        return
      }

      if (kind === 'style') {
        enterDegradedState('在线Style加载失败。')
        return
      }

      if (kind === 'webgl') {
        enterDegradedState('WebGL运行异常，正在使用本地空白底图。')
        return
      }

      if (
        kind === 'source' ||
        kind === 'tile' ||
        kind === 'glyph' ||
        kind === 'sprite'
      ) {
        criticalResourceErrors += 1
        if (
          criticalResourceErrors >=
          mapConfig.errorPolicy.criticalResourceErrorThreshold
        ) {
          enterDegradedState(`在线${kind}资源持续失败。`)
        } else {
          setVisibleState((current) => ({
            ...current,
            detail: mapConfig.messages.resourceWarning,
          }))
        }
      }
    }

    const attachMapLifecycle = (instance: MapLibreMap) => {
      instance.addControl(
        new NavigationControl({ showCompass: false, visualizePitch: false }),
        'top-right',
      )
      instance.on('load', handleLoad)
      instance.on('error', handleError)
      const initialRouteDataset = initialRouteDatasetRef.current
      if (initialRouteDataset && onSelectRouteSegment) {
        routeLayerController = attachRouteLayer(
          instance,
          initialRouteDataset.featureCollection,
          null,
          (routeSegmentId) => {
            onSelectRouteSegment(routeSegmentId)
            onOpenDetail?.(
              { objectType: 'route_segment', objectId: routeSegmentId },
              container,
            )
          },
          initialRoutePlaybackRef.current,
        )
        routeLayerControllerRef.current = routeLayerController
      }
      if (placeDataset) {
        detachPlaceLayer = attachPlaceLayer(
          instance,
          placeDataset.featureCollection,
          onOpenDetail
            ? (placeId) =>
                onOpenDetail(
                  { objectType: 'place', objectId: placeId },
                  container,
                )
            : undefined,
        )
      }
      const initialEventDataset = initialEventDatasetRef.current
      if (initialEventDataset && onSelectEvent) {
        eventLayerController = attachEventLayer(
          instance,
          initialEventDataset.featureCollection,
          null,
          (eventId) => {
            onSelectEvent(eventId)
            onOpenDetail?.(
              { objectType: 'event', objectId: eventId },
              container,
            )
          },
        )
        eventLayerControllerRef.current = eventLayerController
      }

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => instance.resize())
        resizeObserver.observe(container)
      }
    }

    const createMap = (style: string | StyleSpecification) => {
      const instance = new MapLibreMap({
        container,
        style,
        center: mapConfig.initialView.center,
        zoom: mapConfig.initialView.zoom,
        minZoom: mapConfig.initialView.minZoom,
        maxZoom: mapConfig.initialView.maxZoom,
        attributionControl: false,
      })
      map = instance
      attachMapLifecycle(instance)
      return instance
    }

    try {
      createMap(mapConfig.provider.styleUrl)
      loadTimeout = window.setTimeout(() => {
        enterDegradedState('在线底图加载超时。')
      }, mapConfig.errorPolicy.onlineLoadTimeoutMs)
    } catch {
      degraded = true
      try {
        createMap(mapConfig.blankStyle as StyleSpecification)
        queueMicrotask(() => {
          if (!disposed) {
            setVisibleState({
              status: 'degraded',
              detail: mapConfig.messages.blankMode,
            })
          }
        })
      } catch {
        enterFatalState('MapLibre或WebGL初始化失败，且本地空白底图不可用。')
      }
    }

    return () => {
      disposed = true
      clearLoadTimeout()
      resizeObserver?.disconnect()
      detachPlaceLayer?.()
      eventLayerController?.detach()
      routeLayerController?.detach()
      if (eventLayerControllerRef.current === eventLayerController) {
        eventLayerControllerRef.current = null
      }
      if (routeLayerControllerRef.current === routeLayerController) {
        routeLayerControllerRef.current = null
      }
      map?.remove()
      map = null
    }
  }, [onSelectEvent, onSelectRouteSegment, onOpenDetail, placeDataset])

  useEffect(() => {
    if (eventDataset) {
      eventLayerControllerRef.current?.setData(eventDataset.featureCollection)
    }
  }, [eventDataset])

  useEffect(() => {
    if (routeDataset) {
      routeLayerControllerRef.current?.setData(routeDataset.featureCollection)
    }
  }, [routeDataset])

  useEffect(() => {
    eventLayerControllerRef.current?.setSelected(selectedEventId)
  }, [selectedEventId])

  useEffect(() => {
    routeLayerControllerRef.current?.setSelected(selectedRouteSegmentId)
  }, [selectedRouteSegmentId])

  useEffect(() => {
    routeLayerControllerRef.current?.setPlayback(routePlayback)
  }, [routePlayback])

  const statusMessage = mapConfig.messages[visibleState.status]

  return (
    <section className={`base-map base-map--${visibleState.status}`}>
      <div
        ref={containerRef}
        className="base-map__canvas"
        role="region"
        tabIndex={0}
        aria-label="地图，可使用键盘或指针缩放和平移"
      />
      <div className="base-map__status" role="status" aria-live="polite">
        <strong>{statusMessage}</strong>
        {visibleState.detail ? <span>{visibleState.detail}</span> : null}
      </div>
    </section>
  )
}
