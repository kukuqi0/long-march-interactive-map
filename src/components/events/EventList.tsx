import {
  eventTypePresentation,
  type HistoricalEvent,
  type LoadedEventDataset,
} from '../../types/event'
import type { OpenDetail } from '../../types/detail'
import type { OrganizationMatchSource } from '../../types/history'

interface EventListProps {
  dataset: LoadedEventDataset
  selectedEventId: string | null
  onSelectEvent: (eventId: string) => void
  onOpenDetail?: OpenDetail
  isFiltered?: boolean
  isOrganizationFiltered?: boolean
  organizationMatches?: ReadonlyMap<string, OrganizationMatchSource>
}

function EventListItem({
  event,
  isMapped,
  selected,
  onSelect,
  organizationMatch,
}: {
  event: HistoricalEvent
  isMapped: boolean
  selected: boolean
  onSelect: (trigger: HTMLButtonElement) => void
  organizationMatch?: OrganizationMatchSource
}) {
  const presentation = eventTypePresentation[event.event_type]
  return (
    <li className="event-list__item">
      <button
        type="button"
        className="event-list__button"
        aria-pressed={selected}
        onClick={(event) => onSelect(event.currentTarget)}
      >
        <span
          className={`event-list__symbol event-list__symbol--${event.event_type}`}
          aria-hidden="true"
        >
          {presentation.label.slice(0, 1)}
        </span>
        <span className="event-list__content">
          <strong>{event.title}</strong>
          <span>
            事件类型：{presentation.label} · {event.time_original_text}
          </span>
          <span>
            时间精度 {event.time_precision} · 空间精度 {event.spatial_precision}{' '}
            · {isMapped ? '可地图化' : '仅列表'}
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

export function EventList({
  dataset,
  selectedEventId,
  onSelectEvent,
  onOpenDetail,
  isFiltered = false,
  isOrganizationFiltered = false,
  organizationMatches = new Map(),
}: EventListProps) {
  const mappedIds = new Set(
    dataset.featureCollection.features.map(
      (feature) => feature.properties.event_id,
    ),
  )

  return (
    <section className="event-browser" aria-labelledby="event-list-title">
      <div className="event-browser__heading">
        <div>
          <p className="panel-kicker">事件</p>
          <h3 id="event-list-title">事件列表</h3>
        </div>
        <p>当前列表显示 {dataset.events.length} 条事件。</p>
      </div>

      {dataset.events.length === 0 ? (
        <p className="event-browser__state" role="status">
          {isOrganizationFiltered
            ? '当前筛选组合暂无匹配事件；这不表示历史活动不存在。'
            : isFiltered
              ? '当前时间过滤下没有事件；这不表示历史上没有事件。'
              : '暂无可显示的事件；地图和地点图层仍可使用。'}
        </p>
      ) : (
        <ul className="event-list" aria-label="事件列表">
          {dataset.events.map((event) => (
            <EventListItem
              key={event.event_id}
              event={event}
              isMapped={mappedIds.has(event.event_id)}
              selected={selectedEventId === event.event_id}
              organizationMatch={organizationMatches.get(event.event_id)}
              onSelect={(trigger) => {
                onSelectEvent(event.event_id)
                onOpenDetail?.(
                  { objectType: 'event', objectId: event.event_id },
                  trigger,
                )
              }}
            />
          ))}
        </ul>
      )}

      {dataset.errors.length > 0 ? (
        <p
          className="event-browser__state event-browser__state--error"
          role="alert"
        >
          已隔离{dataset.errors.length}
          项事件数据错误；合法事件、地点图层和地图继续显示。
        </p>
      ) : null}
    </section>
  )
}
