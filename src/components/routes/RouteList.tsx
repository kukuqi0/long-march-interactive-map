import type { LoadedPlaceDataset } from '../../types/place'
import type { OpenDetail } from '../../types/detail'
import type { OrganizationMatchSource } from '../../types/history'
import type { LoadedHistoryDataset } from '../../types/history'
import type { CertaintyFilterState } from '../../types/certaintyFilter'
import {
  defaultCertaintyFilter,
  disputeForRouteSegment,
  resolveDisputePresentation,
} from '../../utils/certaintyFilter'
import {
  routeCertaintyPresentation,
  type LoadedRouteDataset,
  type RouteSegment,
} from '../../types/route'

interface RouteListProps {
  dataset: LoadedRouteDataset
  places: LoadedPlaceDataset
  selectedRouteSegmentId: string | null
  onSelectRouteSegment: (routeSegmentId: string) => void
  onOpenDetail?: OpenDetail
  isFiltered?: boolean
  isOrganizationFiltered?: boolean
  organizationMatches?: ReadonlyMap<string, OrganizationMatchSource>
  history?: LoadedHistoryDataset
  certaintyFilter?: CertaintyFilterState
}

function placeName(placeId: string | null, places: LoadedPlaceDataset) {
  if (!placeId) {
    return '未知端点'
  }
  const feature = places.featureCollection.features.find(
    (item) => item.properties.place_id === placeId,
  )
  if (feature) {
    return feature.properties.display_name
  }
  const place = places.places.find((item) => item.place_id === placeId)
  return place?.modern_reference_name
    ? `${place.modern_reference_name}（现代参照）`
    : placeId
}

function RouteSegmentItem({
  segment,
  routeTitle,
  mapped,
  places,
  selected,
  onSelect,
  organizationMatch,
  dispute,
  variantView,
  alternativesVisible,
}: {
  segment: RouteSegment
  routeTitle: string
  mapped: boolean
  places: LoadedPlaceDataset
  selected: boolean
  onSelect: (trigger: HTMLButtonElement) => void
  organizationMatch?: OrganizationMatchSource
  dispute?: ReturnType<typeof disputeForRouteSegment>
  variantView: CertaintyFilterState['routeVariantView']
  alternativesVisible: boolean
}) {
  const certainty = routeCertaintyPresentation[segment.route_certainty]
  return (
    <li className="route-list__item">
      <button
        type="button"
        className="route-list__button"
        aria-pressed={selected}
        onClick={(event) => onSelect(event.currentTarget)}
      >
        <span
          className={`route-list__swatch route-list__swatch--${segment.route_certainty.toLowerCase()}`}
          aria-hidden="true"
        />
        <span className="route-list__content">
          <strong>
            {routeTitle} · 路段{segment.sequence_no}
          </strong>
          <span>
            {placeName(segment.from_place_id, places)} →{' '}
            {placeName(segment.to_place_id, places)}
          </span>
          <span>
            {certainty.label} · {segment.time_original_text}
          </span>
          <span>{segment.uncertainty_note ?? '无附加不确定性说明'}</span>
          {dispute ? (
            <span className="route-list__dispute">
              <strong>争议</strong> ·{' '}
              {resolveDisputePresentation(dispute.dispute_status).label} ·
              争议方案演示 / 待史料核验
            </span>
          ) : null}
          {segment.route_certainty === 'R4' ? (
            <span>
              当前方案：
              {alternativesVisible
                ? variantView === 'both'
                  ? 'A+B并列'
                  : `方案${variantView}`
                : '替代争议几何默认关闭'}
            </span>
          ) : null}
          <span>
            时间精度 {segment.time_precision} · 空间精度{' '}
            {segment.spatial_precision} · {segment.geometry_method} ·{' '}
            {mapped ? '可地图化' : '仅列表'}
          </span>
          <small>
            {organizationMatch
              ? ` · 组织匹配：${organizationMatch === 'direct' ? '直接匹配' : '聚合成员匹配'}`
              : ''}
            {selected ? ' · 当前选中' : ''}
          </small>
        </span>
      </button>
    </li>
  )
}

export function RouteList({
  dataset,
  places,
  selectedRouteSegmentId,
  onSelectRouteSegment,
  onOpenDetail,
  isFiltered = false,
  isOrganizationFiltered = false,
  organizationMatches = new Map(),
  history,
  certaintyFilter = defaultCertaintyFilter,
}: RouteListProps) {
  const mappedIds = new Set(
    dataset.featureCollection.features.map(
      (feature) => feature.properties.route_segment_id,
    ),
  )
  const routesById = new Map(
    dataset.routes.map((route) => [route.route_id, route]),
  )

  return (
    <section className="route-browser" aria-labelledby="route-list-title">
      <div className="route-browser__heading">
        <div>
          <p className="panel-kicker">路线</p>
          <h3 id="route-list-title">路线段列表</h3>
        </div>
        <p>当前列表显示 {dataset.routeSegments.length} 条路线段。</p>
        <p className="route-browser__aggregate-warning">
          此处分组用于专题浏览，不代表历史时期的正式建制隶属关系。
        </p>
      </div>

      <div className="route-legend" aria-label="路线确定性图例">
        {Object.entries(routeCertaintyPresentation).map(
          ([certainty, presentation]) => (
            <span key={certainty}>
              <i
                className={`route-list__swatch route-list__swatch--${certainty.toLowerCase()}`}
                aria-hidden="true"
              />
              {presentation.label}：{presentation.visual}
            </span>
          ),
        )}
      </div>

      {dataset.routeSegments.length === 0 ? (
        <p className="route-browser__state" role="status">
          {isOrganizationFiltered
            ? '当前样例没有直接归属于所选组织的路线数据；这不表示历史上没有路线。'
            : isFiltered
              ? '当前时间过滤下没有路线段；这不表示历史上没有路线。'
              : '暂无可显示的路线段；地图、地点和事件仍可使用。'}
        </p>
      ) : (
        <ul className="route-list" aria-label="路线段列表">
          {dataset.routeSegments.map((segment) => (
            <RouteSegmentItem
              key={segment.route_segment_id}
              segment={segment}
              routeTitle={
                routesById.get(segment.route_id)?.title ?? segment.route_id
              }
              mapped={mappedIds.has(segment.route_segment_id)}
              places={places}
              selected={selectedRouteSegmentId === segment.route_segment_id}
              organizationMatch={organizationMatches.get(
                segment.route_segment_id,
              )}
              dispute={
                history
                  ? disputeForRouteSegment(segment.route_segment_id, history)
                  : undefined
              }
              variantView={certaintyFilter.routeVariantView}
              alternativesVisible={certaintyFilter.showDisputedAlternatives}
              onSelect={(trigger) => {
                onSelectRouteSegment(segment.route_segment_id)
                onOpenDetail?.(
                  {
                    objectType: 'route_segment',
                    objectId: segment.route_segment_id,
                  },
                  trigger,
                )
              }}
            />
          ))}
        </ul>
      )}

      {dataset.errors.length > 0 ? (
        <p
          className="route-browser__state route-browser__state--error"
          role="alert"
        >
          已隔离{dataset.errors.length}
          项路线数据错误；合法路线段、地点、事件和地图继续显示。
        </p>
      ) : null}
    </section>
  )
}
