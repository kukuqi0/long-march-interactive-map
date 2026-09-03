import { useCallback, useEffect, useRef } from 'react'
import { EventList } from '../events/EventList'
import { BaseMap } from '../map/BaseMap'
import { RouteList } from '../routes/RouteList'
import type { LoadedEventDataset } from '../../types/event'
import type { OpenDetail } from '../../types/detail'
import type { LoadedPlaceDataset } from '../../types/place'
import type { LoadedRouteDataset } from '../../types/route'
import type { RoutePlaybackVisualState } from '../../types/playback'
import type { OrganizationMatchSource } from '../../types/history'
import type { LoadedHistoryDataset } from '../../types/history'
import type { CertaintyFilterState } from '../../types/certaintyFilter'
import { ResponsiveSection } from './ResponsiveSection'

interface MainWorkspaceProps {
  placeDataset: LoadedPlaceDataset
  eventDataset: LoadedEventDataset
  routeDataset: LoadedRouteDataset
  selectedEventId: string | null
  selectedRouteSegmentId: string | null
  routePlayback: RoutePlaybackVisualState
  onSelectEvent: (eventId: string) => void
  onSelectRouteSegment: (routeSegmentId: string) => void
  isTimeFiltered: boolean
  isOrganizationFiltered: boolean
  isCertaintyFiltered: boolean
  historyDataset: LoadedHistoryDataset
  certaintyFilter: CertaintyFilterState
  eventMatches: ReadonlyMap<string, OrganizationMatchSource>
  routeSegmentMatches: ReadonlyMap<string, OrganizationMatchSource>
  onOpenDetail: OpenDetail
  onCloseDetail: () => void
}

export function MainWorkspace({
  placeDataset,
  eventDataset,
  routeDataset,
  selectedEventId,
  selectedRouteSegmentId,
  routePlayback,
  onSelectEvent,
  onSelectRouteSegment,
  isTimeFiltered,
  isOrganizationFiltered,
  isCertaintyFiltered,
  historyDataset,
  certaintyFilter,
  eventMatches,
  routeSegmentMatches,
  onOpenDetail,
  onCloseDetail,
}: MainWorkspaceProps) {
  const selectedEventRef = useRef(selectedEventId)
  const selectedRouteRef = useRef(selectedRouteSegmentId)
  useEffect(() => {
    selectedEventRef.current = selectedEventId
  }, [selectedEventId])
  useEffect(() => {
    selectedRouteRef.current = selectedRouteSegmentId
  }, [selectedRouteSegmentId])
  const openOrCloseDetail = useCallback<OpenDetail>(
    (detail, trigger) => {
      const cancelsEvent =
        detail.objectType === 'event' &&
        selectedEventRef.current === detail.objectId
      const cancelsRoute =
        detail.objectType === 'route_segment' &&
        selectedRouteRef.current === detail.objectId
      if (cancelsEvent || cancelsRoute) {
        onCloseDetail()
        return
      }
      onOpenDetail(detail, trigger)
    },
    [onCloseDetail, onOpenDetail],
  )

  return (
    <main
      className="layout-panel main-workspace"
      aria-labelledby="main-workspace-title"
    >
      <div className="panel-heading">
        <h2 id="main-workspace-title">地图</h2>
      </div>
      <BaseMap
        placeDataset={placeDataset}
        eventDataset={eventDataset}
        selectedEventId={selectedEventId}
        onSelectEvent={onSelectEvent}
        routeDataset={routeDataset}
        selectedRouteSegmentId={selectedRouteSegmentId}
        routePlayback={routePlayback}
        onSelectRouteSegment={onSelectRouteSegment}
        onOpenDetail={openOrCloseDetail}
      />
      <ResponsiveSection
        title="地点与详情入口"
        summary={`${placeDataset.places.length} 条地点`}
      >
        <section
          className="main-workspace__place-summary"
          aria-labelledby="place-sample-title"
        >
          <h3 id="place-sample-title">地点记录</h3>
          {placeDataset.ok ? (
            <p>
              已加载{placeDataset.places.length}条地点记录，其中
              {placeDataset.featureCollection.features.length}条进入点图层、
              {placeDataset.unmapped.length}条按空间规则未地图化。
            </p>
          ) : (
            <p role="alert">
              地点数据不可用；地图和页面其他区域仍可继续使用。共发现
              {placeDataset.errors.length}项数据错误。
            </p>
          )}
          <p className="main-workspace__place-legend">
            <span
              className="place-swatch place-swatch--regular"
              aria-hidden="true"
            />
            地点标记
            <span
              className="place-swatch place-swatch--representative"
              aria-hidden="true"
            />
            代表点（非精确位置）
          </p>
          <ul className="place-detail-triggers" aria-label="地点详情入口">
            {placeDataset.places.map((place) => {
              const historicalName = placeDataset.historicalNames.find(
                (name) => name.place_id === place.place_id,
              )
              const label =
                historicalName?.name ??
                place.modern_reference_name ??
                place.place_id
              return (
                <li key={place.place_id}>
                  <button
                    type="button"
                    className="place-detail-trigger"
                    onClick={(event) =>
                      onOpenDetail(
                        { objectType: 'place', objectId: place.place_id },
                        event.currentTarget,
                      )
                    }
                  >
                    查看地点：{label}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </ResponsiveSection>
      <p className="main-workspace__layer-legend">
        <span
          className="place-swatch place-swatch--regular"
          aria-hidden="true"
        />
        圆点＝地点
        <span className="event-symbol-sample" aria-hidden="true">
          ◆
        </span>
        图形符号＝事件
        <span className="route-line-sample" aria-hidden="true" />
        线/廊道＝路线；三类对象不只依赖颜色区分
      </p>
      <ResponsiveSection
        title="事件列表"
        summary={`${eventDataset.events.length} 条当前可见事件`}
      >
        <EventList
          dataset={eventDataset}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
          isFiltered={
            isTimeFiltered || isOrganizationFiltered || isCertaintyFiltered
          }
          isOrganizationFiltered={isOrganizationFiltered}
          organizationMatches={eventMatches}
          onOpenDetail={openOrCloseDetail}
        />
      </ResponsiveSection>
      <ResponsiveSection
        title="路线段列表"
        summary={`${routeDataset.routeSegments.length} 条当前可见路线段`}
      >
        <RouteList
          dataset={routeDataset}
          places={placeDataset}
          selectedRouteSegmentId={selectedRouteSegmentId}
          onSelectRouteSegment={onSelectRouteSegment}
          isFiltered={
            isTimeFiltered || isOrganizationFiltered || isCertaintyFiltered
          }
          isOrganizationFiltered={isOrganizationFiltered}
          history={historyDataset}
          certaintyFilter={certaintyFilter}
          organizationMatches={routeSegmentMatches}
          onOpenDetail={openOrCloseDetail}
        />
      </ResponsiveSection>
    </main>
  )
}
