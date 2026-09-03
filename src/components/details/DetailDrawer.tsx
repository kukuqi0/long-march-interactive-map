import { useEffect, useRef, type ReactNode } from 'react'
import {
  eventTypePresentation,
  type LoadedEventDataset,
} from '../../types/event'
import type {
  ActiveDetail,
  DetailError,
  OpenDetail,
  PersonDetailRecord,
} from '../../types/detail'
import type { LoadedOrganizationDataset } from '../../types/organization'
import type {
  LoadedHistoryDataset,
  OrganizationMatchSource,
} from '../../types/history'
import type { CertaintyFilterState } from '../../types/certaintyFilter'
import {
  claimsForDispute,
  disputeForRouteSegment,
  resolveDisputePresentation,
} from '../../utils/certaintyFilter'
import type { LoadedPlaceDataset, ReviewStatus } from '../../types/place'
import {
  routeCertaintyPresentation,
  type LoadedRouteDataset,
} from '../../types/route'
import './DetailDrawer.css'
import { SourcePanel } from './SourcePanel'

interface DetailDrawerProps {
  active: ActiveDetail
  places: LoadedPlaceDataset
  events: LoadedEventDataset
  organizations: LoadedOrganizationDataset
  routes: LoadedRouteDataset
  history?: LoadedHistoryDataset
  organizationMatchSource?: OrganizationMatchSource | null
  certaintyFilter?: CertaintyFilterState
  onClose: () => void
  onOpenDetail: OpenDetail
}

const missing = {
  absent: '字段不存在',
  unknown: '未知',
  empty: '空数组',
  relation: '关联数据尚未建立',
  phase: '当前阶段未实现',
  failed: '数据加载失败',
} as const

export function MissingFieldState({ kind }: { kind: keyof typeof missing }) {
  return <span data-missing-kind={kind}>{missing[kind]}</span>
}

function value(value: unknown, nullLabel: string = missing.unknown) {
  if (value === undefined) return missing.absent
  if (value === null) return nullLabel
  if (Array.isArray(value) && value.length === 0) return missing.empty
  if (typeof value === 'boolean') return String(value)
  return String(value)
}

function Fields({ children }: { children: ReactNode }) {
  return <dl className="detail-fields">{children}</dl>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-fields__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function OrganizationMatchState({
  source,
}: {
  source?: OrganizationMatchSource | null
}) {
  if (!source) return null
  return (
    <section className="detail-section" aria-labelledby="detail-match-title">
      <h4 id="detail-match-title">当前组织筛选匹配</h4>
      <p>
        匹配依据：{source === 'direct' ? '直接匹配' : '聚合成员匹配'}。
        这是当前视图筛选来源，不等同于新的历史证据或组织隶属关系。
      </p>
    </section>
  )
}

function DataState({
  objectId,
  objectType,
  entity,
}: {
  objectId: string
  objectType: string
  entity: {
    review_status?: ReviewStatus | 'draft'
    data_version?: string
    created_at?: string
    updated_at?: string
  }
}) {
  const withdrawn = entity.review_status === 'withdrawn'
  return (
    <section
      className={`detail-state ${withdrawn ? 'detail-state--withdrawn' : ''}`}
      aria-labelledby="detail-state-title"
    >
      <h4 id="detail-state-title">数据状态</h4>
      {withdrawn ? (
        <div role="alert">
          <strong>已撤回</strong>
          <p>当前内容不作为有效结论，也不具有发布含义。</p>
          <p>撤回原因/记录未提供</p>
        </div>
      ) : entity.review_status === 'draft' ? (
        <p>
          <strong>资料待核验</strong>：当前内容仍在整理，不构成正式历史结论。
        </p>
      ) : null}
      <Fields>
        <Field label="稳定对象 ID">{objectId}</Field>
        <Field label="对象类型">{objectType}</Field>
        <Field label="审核状态">
          {entity.review_status === 'draft'
            ? '待核验'
            : value(entity.review_status)}
        </Field>
      </Fields>
    </section>
  )
}

function placeDisplayName(placeId: string, places: LoadedPlaceDataset) {
  const historical = places.historicalNames.find(
    (name) => name.place_id === placeId,
  )
  const place = places.places.find(
    (candidate) => candidate.place_id === placeId,
  )
  return historical?.name ?? place?.modern_reference_name ?? placeId
}

function PlaceDetail({
  id,
  places,
  events,
}: {
  id: string
  places: LoadedPlaceDataset
  events: LoadedEventDataset
}) {
  const place = places.places.find((candidate) => candidate.place_id === id)
  if (!place)
    return <DetailFailure active={{ objectType: 'place', objectId: id }} />
  const names = places.historicalNames.filter((name) => name.place_id === id)
  const relatedEvents = events.events.filter((event) => event.place_id === id)
  const renderFeature = places.featureCollection.features.find(
    (feature) => feature.properties.place_id === id,
  )
  return (
    <>
      <section className="detail-section">
        <h3>{placeDisplayName(id, places)}</h3>
        <Fields>
          <Field label="历史名称">
            {names.length ? (
              <ul className="detail-inline-list">
                {names.map((name) => (
                  <li key={name.historical_name_id}>
                    {name.name}（{name.name_type}；{value(name.valid_from)}—
                    {value(name.valid_to)}）
                  </li>
                ))}
              </ul>
            ) : (
              missing.relation
            )}
          </Field>
          <Field label="现代参照名">
            {value(place.modern_reference_name, '未提供')}
          </Field>
          <Field label="几何类型">{place.geometry_type}</Field>
          <Field label="空间精度">
            {place.spatial_precision === 'SU'
              ? 'SU（空间未知）'
              : place.spatial_precision}
          </Field>
          <Field label="几何引用状态">
            {place.geometry_ref
              ? `已引用 ${place.geometry_ref}；不等同于精确历史坐标`
              : '未提供几何引用'}
          </Field>
          <Field label="匹配状态">{place.match_status}</Field>
          <Field label="匹配说明">{value(place.match_note, '未提供')}</Field>
          <Field label="当时行政归属">{missing.phase}</Field>
          <Field label="关联事件">
            {relatedEvents.length
              ? relatedEvents.map((event) => event.title).join('；')
              : missing.relation}
          </Field>
        </Fields>
        {renderFeature?.properties.is_representative_point ? (
          <p className="detail-warning">
            {place.spatial_precision === 'S1'
              ? 'S1聚落级代表点：仅用于县城级地图识别，不表示具体战斗位置。'
              : '区域代表点：仅用于表达区域，不是精确历史位置。'}
          </p>
        ) : null}
        {place.spatial_precision === 'SU' ? (
          <p className="detail-warning">空间未知，不生成坐标或地图定位。</p>
        ) : null}
      </section>
      <DataState objectId={id} objectType="place" entity={place} />
    </>
  )
}

function EventDetail({
  id,
  events,
  places,
}: {
  id: string
  events: LoadedEventDataset
  places: LoadedPlaceDataset
}) {
  const event = events.events.find((candidate) => candidate.event_id === id)
  if (!event)
    return <DetailFailure active={{ objectType: 'event', objectId: id }} />
  return (
    <>
      <section className="detail-section">
        <h3>{event.title}</h3>
        <Fields>
          <Field label="事件类型">
            {eventTypePresentation[event.event_type].label}
          </Field>
          <Field label="原时间文本">{event.time_original_text}</Field>
          <Field label="标准开始时间">
            {value(event.time_start, '时间未知')}
          </Field>
          <Field label="标准结束时间">
            {value(event.time_end, '时间未知')}
          </Field>
          <Field label="时间精度">{event.time_precision}</Field>
          <Field label="地点">
            {event.place_id
              ? placeDisplayName(event.place_id, places)
              : '地点未知'}
          </Field>
          <Field label="空间精度">{event.spatial_precision}</Field>
          <Field label="摘要">{value(event.summary, '未提供')}</Field>
          <Field label="关联路线段">{missing.relation}</Field>
        </Fields>
        <p className="detail-warning">
          摘要及时间仍待核验，不构成正式历史结论。
        </p>
      </section>
      <DataState objectId={id} objectType="event" entity={event} />
    </>
  )
}

function RouteSegmentDetail({
  id,
  routes,
  places,
  organizations,
  onOpenDetail,
  history,
  certaintyFilter,
}: {
  id: string
  routes: LoadedRouteDataset
  places: LoadedPlaceDataset
  organizations: LoadedOrganizationDataset
  onOpenDetail: OpenDetail
  history?: LoadedHistoryDataset
  certaintyFilter?: CertaintyFilterState
}) {
  const segment = routes.routeSegments.find(
    (candidate) => candidate.route_segment_id === id,
  )
  if (!segment)
    return (
      <DetailFailure active={{ objectType: 'route_segment', objectId: id }} />
    )
  const route = routes.routes.find(
    (candidate) => candidate.route_id === segment.route_id,
  )
  const organization = organizations.registry.findById(segment.organization_id)
  const alternatives = routes.featureCollection.features.filter(
    (feature) => feature.properties.route_segment_id === id,
  )
  const mapped = alternatives.length > 0
  const dispute = history ? disputeForRouteSegment(id, history) : undefined
  const competingClaims =
    dispute && history ? claimsForDispute(dispute, history.claims) : []
  return (
    <>
      <section className="detail-section">
        <h3>
          {route?.title ?? missing.relation} · 路段 {segment.sequence_no}
        </h3>
        <p className="detail-derived">
          界面派生标签，未写回 route_segment 数据。
        </p>
        <Fields>
          <Field label="所属 route 标题">{value(route?.title)}</Field>
          <Field label="route 角色">{value(route?.route_role)}</Field>
          <Field label="sequence_no">{segment.sequence_no}</Field>
          <Field label="行动组织">
            {organization ? (
              <button
                type="button"
                className="detail-link-button"
                onClick={(event) =>
                  onOpenDetail(
                    {
                      objectType: 'organization',
                      objectId: organization.organization_id,
                    },
                    event.currentTarget,
                  )
                }
              >
                {organization.name}（打开组织详情）
              </button>
            ) : (
              missing.relation
            )}
          </Field>
          <Field label="起点">
            {segment.from_place_id
              ? placeDisplayName(segment.from_place_id, places)
              : '未知端点'}
          </Field>
          <Field label="终点">
            {segment.to_place_id
              ? placeDisplayName(segment.to_place_id, places)
              : '未知端点'}
          </Field>
          <Field label="原时间文本">{segment.time_original_text}</Field>
          <Field label="标准开始时间">
            {value(segment.time_start, '时间未知')}
          </Field>
          <Field label="标准结束时间">
            {value(segment.time_end, '时间未知')}
          </Field>
          <Field label="时间精度">{segment.time_precision}</Field>
          <Field label="移动类型">{segment.movement_type}</Field>
          <Field label="路线确定性">
            {routeCertaintyPresentation[segment.route_certainty].label}
          </Field>
          <Field label="空间精度">{segment.spatial_precision}</Field>
          <Field label="几何方法">{segment.geometry_method}</Field>
          <Field label="几何引用状态">
            {segment.geometry_ref
              ? `已引用 ${segment.geometry_ref}`
              : '未提供几何；不生成连接线'}
          </Field>
          <Field label="不确定性说明">
            {value(segment.uncertainty_note, '不适用')}
          </Field>
          <Field label="可地图化">{mapped ? '是' : '否（仅列表与详情）'}</Field>
          {segment.route_certainty === 'R4' ? (
            <Field label="替代方案">
              {alternatives
                .map((feature) => feature.properties.alternative_label)
                .join('；')}
              ；各方案保持分离，未采纳唯一方案。
            </Field>
          ) : null}
        </Fields>
        <p className="detail-warning">
          {routeCertaintyPresentation[segment.route_certainty].visual}
          表示当前记录的路线表达方式，不构成最终历史路线结论。
        </p>
      </section>
      {dispute ? (
        <section
          className="detail-section"
          aria-labelledby="route-dispute-title"
        >
          <h4 id="route-dispute-title">争议摘要</h4>
          <p className="detail-dispute-badge">争议 · R4争议路线</p>
          <Fields>
            <Field label="dispute_id">
              <span className="detail-token">{dispute.dispute_id}</span>
            </Field>
            <Field label="dispute title">{dispute.title}</Field>
            <Field label="dispute_status">
              {dispute.dispute_status} ·{' '}
              {resolveDisputePresentation(dispute.dispute_status).label}
            </Field>
            <Field label="当前查看方案">
              {certaintyFilter?.showDisputedAlternatives
                ? certaintyFilter.routeVariantView === 'both'
                  ? 'A+B并列'
                  : `方案${certaintyFilter.routeVariantView}`
                : '争议替代几何默认关闭'}
            </Field>
            <Field label="竞争声明">
              <ul className="detail-inline-list">
                {competingClaims.map((claim) => (
                  <li key={claim.claim_id}>
                    <span className="detail-token">{claim.claim_id}</span> →{' '}
                    <span className="detail-token">{claim.object_value}</span> ·{' '}
                    {claim.claim_confidence}
                  </li>
                ))}
              </ul>
            </Field>
            <Field label="adopted_claim_id">
              {value(dispute.adopted_claim_id, '未采纳任何方案')}
            </Field>
            <Field label="editorial_note">{dispute.editorial_note}</Field>
          </Fields>
          <p className="detail-warning detail-warning--strong">
            争议方案演示 / 待史料核验：当前没有史料证据链，A/B同权且未作裁定。
          </p>
        </section>
      ) : null}
      <DataState objectId={id} objectType="route_segment" entity={segment} />
    </>
  )
}

function OrganizationDetail({
  id,
  organizations,
}: {
  id: string
  organizations: LoadedOrganizationDataset
}) {
  const organization = organizations.registry.findById(id)
  if (!organization) {
    return (
      <DetailFailure
        active={{ objectType: 'organization', objectId: id }}
        code="ORGANIZATION_NOT_FOUND"
      />
    )
  }
  return (
    <>
      <section className="detail-section">
        <h3>{organization.name}</h3>
        <Fields>
          <Field label="组织类型">{organization.organization_type}</Field>
          <Field label="建制层级">{value(organization.echelon, '未知')}</Field>
          <Field label="有效期">
            {value(organization.valid_from, '未知')}—
            {value(organization.valid_to, '未知')}
          </Field>
          <Field label="时间精度">{organization.time_precision}</Field>
          <Field label="说明">
            {value(organization.description, '未提供')}
          </Field>
          <Field label="上级、下级、前身、后继">{missing.relation}</Field>
        </Fields>
        {organization.echelon === 'aggregate' ? (
          <div className="detail-warning detail-warning--strong">
            <strong>专题分组说明</strong>
            <p>
              此处分组用于专题浏览，不代表历史时期的正式建制隶属关系，也不表示所有相关单位处于同一时间、同一地点或采用相同路线。
            </p>
          </div>
        ) : (
          <div className="detail-warning detail-warning--strong">
            <strong>历史组织说明</strong>
            <p>有效期起点是本专题的数据覆盖裁剪下界，不是组织成立日期。</p>
          </div>
        )}
      </section>
      <DataState
        objectId={id}
        objectType="organization"
        entity={organization}
      />
    </>
  )
}

export function PersonDetail({ person }: { person: PersonDetailRecord }) {
  return (
    <>
      <section className="detail-section">
        <h3>{person.canonical_name}</h3>
        <Fields>
          <Field label="异名">{value(person.aliases, '未提供')}</Field>
          <Field label="说明">{value(person.description, '未提供')}</Field>
          <Field label="角色数据">{missing.relation}</Field>
          <Field label="来源数据">{missing.relation}</Field>
        </Fields>
      </section>
      <DataState
        objectId={person.person_id}
        objectType="person"
        entity={person}
      />
    </>
  )
}

function DetailFailure({
  active,
  code = 'DETAIL_OBJECT_NOT_FOUND',
}: {
  active: ActiveDetail
  code?: string
}) {
  const error: DetailError = {
    object_type: active.objectType,
    object_id: active.objectId,
    field: 'object_id',
    code,
    reason:
      active.objectType === 'person'
        ? '人物生产数据尚未建立，不能使用测试夹具冒充现有人物。'
        : '对象未在对应的已验证数据集中找到，未使用默认对象回退。',
  }
  return (
    <section className="detail-error" role="alert">
      <h3>对象详情不可用</h3>
      <Fields>
        {Object.entries(error).map(([key, item]) => (
          <Field key={key} label={key}>
            {item}
          </Field>
        ))}
      </Fields>
    </section>
  )
}

export function DetailDrawer({
  active,
  places,
  events,
  organizations,
  routes,
  history,
  organizationMatchSource,
  certaintyFilter,
  onClose,
  onOpenDetail,
}: DetailDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(
    () => closeRef.current?.focus(),
    [active.objectId, active.objectType],
  )
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  let content: ReactNode
  if (active.objectType === 'place')
    content = (
      <PlaceDetail id={active.objectId} places={places} events={events} />
    )
  else if (active.objectType === 'event')
    content = (
      <EventDetail id={active.objectId} events={events} places={places} />
    )
  else if (active.objectType === 'route_segment') {
    content = (
      <RouteSegmentDetail
        id={active.objectId}
        routes={routes}
        places={places}
        organizations={organizations}
        onOpenDetail={onOpenDetail}
        history={history}
        certaintyFilter={certaintyFilter}
      />
    )
  } else if (active.objectType === 'organization') {
    content = (
      <OrganizationDetail id={active.objectId} organizations={organizations} />
    )
  } else content = <DetailFailure active={active} />

  return (
    <div
      className="detail-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="detail-drawer-title"
    >
      <header className="detail-drawer__header">
        <div>
          <p className="panel-kicker">对象详情</p>
          <h2 id="detail-drawer-title" aria-live="polite">
            {active.objectType} · {active.objectId}
          </h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="detail-drawer__close"
          aria-label="关闭对象详情"
          onClick={onClose}
        >
          关闭
        </button>
      </header>
      <div className="detail-drawer__body">
        {content}
        <OrganizationMatchState source={organizationMatchSource} />
        {history ? (
          <SourcePanel
            objectType={active.objectType}
            objectId={active.objectId}
            history={history}
          />
        ) : (
          <section className="detail-section" role="status">
            <h4>声明与史料来源</h4>
            <p>声明、证据和来源数据未加载。</p>
          </section>
        )}
      </div>
    </div>
  )
}
