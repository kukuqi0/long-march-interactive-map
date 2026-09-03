import { useMemo, type RefObject } from 'react'
import type { HistoricalEvent } from '../../types/event'
import type {
  PlaybackSpeed,
  PlaybackState,
  PlaybackStep,
} from '../../types/playback'
import type {
  AppliedTimeFilter,
  TemporalObjectType,
  TimeFilterStatus,
} from '../../types/timeFilter'
import {
  TOPIC_END_DATE,
  TOPIC_START_DATE,
  type TimelineDatedItem,
  type TimelineView,
} from '../../types/timeline'
import {
  findEventNeighbors,
  timelineDateToIndex,
  timelineIndexToDate,
  timelineItemIsCurrent,
  timelineMaximumIndex,
} from '../../utils/timeline'
import { PlaybackControls } from '../playback/PlaybackControls'
import { ResponsiveSection } from './ResponsiveSection'

interface TimelinePanelProps {
  draftFilter: AppliedTimeFilter
  appliedFilter: AppliedTimeFilter
  error: string | null
  message: string | null
  timelineView: TimelineView
  allEvents: readonly HistoricalEvent[]
  selectedEventId: string | null
  selectedRouteSegmentId: string | null
  visibleEventCount: number
  totalEventCount: number
  visibleRouteSegmentCount: number
  totalRouteSegmentCount: number
  headingRef: RefObject<HTMLHeadingElement | null>
  playbackState: PlaybackState
  currentPlaybackStep: PlaybackStep | null
  playbackError: string | null
  onDraftChange: (patch: Partial<AppliedTimeFilter>) => void
  onApply: () => void
  onClear: () => void
  onReferenceDateChange: (date: string) => void
  onActivate: (
    objectType: TemporalObjectType,
    objectId: string,
    trigger: HTMLButtonElement,
    date?: string,
  ) => void
  onTogglePlayback: () => void
  onPlaybackSpeedChange: (speed: PlaybackSpeed) => void
}

const statusLabels: Record<TimeFilterStatus, string> = {
  all: '全部',
  completed: '已完成',
  current: '当前',
  future: '未来',
  sequence_only: '仅顺序（T6）',
  unknown: '时间未知（TU）',
}

const precisionLabels = {
  T0: '具体时刻（现有契约仅按已存日期边界）',
  T1: '确定日期',
  T2: '旬级，具体日不详',
  T3: '月级，具体日不详',
  T4: '多日或多月区间',
  T5: '年级，不宜细粒度定位',
  T6: '日期不详，仅知顺序',
  TU: '时间未知',
} as const

function itemStyle(item: TimelineDatedItem) {
  const anchor = item.startPercent ?? item.endPercent ?? 0
  if (item.shape === 'node') return { left: `${anchor}%` }
  if (item.startPercent !== null && item.endPercent !== null) {
    return {
      left: `${item.startPercent}%`,
      width: `${Math.max(0.8, item.endPercent - item.startPercent)}%`,
    }
  }
  return { left: `${anchor}%` }
}

export function TimelinePanel({
  draftFilter,
  appliedFilter,
  error,
  message,
  timelineView,
  allEvents,
  selectedEventId,
  selectedRouteSegmentId,
  visibleEventCount,
  totalEventCount,
  visibleRouteSegmentCount,
  totalRouteSegmentCount,
  headingRef,
  playbackState,
  currentPlaybackStep,
  playbackError,
  onDraftChange,
  onApply,
  onClear,
  onReferenceDateChange,
  onActivate,
  onTogglePlayback,
  onPlaybackSpeedChange,
}: TimelinePanelProps) {
  const appliedRequiresDate = ['completed', 'current', 'future'].includes(
    appliedFilter.status,
  )
  const sliderIndex = timelineDateToIndex(appliedFilter.referenceDate)
  const sliderAvailable =
    sliderIndex.ok &&
    appliedFilter.status !== 'sequence_only' &&
    appliedFilter.status !== 'unknown'
  const neighbors = useMemo(
    () => findEventNeighbors(allEvents, appliedFilter.referenceDate),
    [allEvents, appliedFilter.referenceDate],
  )
  const hasCurrentObject =
    sliderIndex.ok &&
    timelineView.dated.some((item) =>
      timelineItemIsCurrent(item, appliedFilter.referenceDate),
    )
  const timelineEmptyMessage = timelineView.errors.length
    ? '部分时间对象加载失败；非法对象未被伪定位，其他合法对象仍可使用。'
    : visibleEventCount + visibleRouteSegmentCount === 0
      ? '当前筛选结果为空；这不等于没有历史活动。'
      : timelineView.dated.length === 0 && timelineView.sequenceOnly.length > 0
        ? '当前仅有 T6 顺序对象；它们没有可定位日期。'
        : timelineView.dated.length === 0 && timelineView.unknown.length > 0
          ? '当前仅有 TU 未知时间对象；它们没有日期或顺序。'
          : sliderIndex.ok && !hasCurrentObject
            ? '当前日期无已录入可见数据；这不等于没有历史活动。'
            : null

  return (
    <footer
      className="layout-panel timeline-panel"
      aria-labelledby="timeline-panel-title"
    >
      <div className="panel-heading">
        <p className="panel-kicker">时间轴</p>
        <h2 id="timeline-panel-title" ref={headingRef} tabIndex={-1}>
          时间过滤
        </h2>
      </div>
      <form
        className="time-filter"
        onSubmit={(event) => {
          event.preventDefault()
          onApply()
        }}
      >
        <label>
          <span>参考日期</span>
          <input
            type="date"
            min={TOPIC_START_DATE}
            max={TOPIC_END_DATE}
            value={draftFilter.referenceDate}
            disabled={
              draftFilter.status === 'sequence_only' ||
              draftFilter.status === 'unknown'
            }
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'time-filter-error' : 'time-filter-note'}
            onChange={(event) =>
              onDraftChange({ referenceDate: event.currentTarget.value })
            }
          />
        </label>
        <label>
          <span>时间状态</span>
          <select
            value={draftFilter.status}
            onChange={(event) =>
              onDraftChange({
                status: event.currentTarget.value as TimeFilterStatus,
              })
            }
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">应用过滤</button>
        <button type="button" onClick={onClear}>
          清除过滤
        </button>
      </form>
      <div className="timeline-panel__content">
        {error ? (
          <p id="time-filter-error" className="time-filter__error" role="alert">
            {error}
          </p>
        ) : null}
        <p id="time-filter-note">
          专题核心范围 {TOPIC_START_DATE} 至 {TOPIC_END_DATE}
          。输入、游标和事件导航共用同一参考日期；区间边界均包含。
        </p>
        <p aria-live="polite">
          当前：{statusLabels[appliedFilter.status]}
          {appliedRequiresDate && appliedFilter.referenceDate
            ? `（参考日 ${appliedFilter.referenceDate}）`
            : ''}
          ；事件 {visibleEventCount}/{totalEventCount}，路线段{' '}
          {visibleRouteSegmentCount}/{totalRouteSegmentCount}。
        </p>
        {message ? (
          <p className="timeline-feedback" role="status">
            {message}
          </p>
        ) : null}
      </div>

      <PlaybackControls
        state={playbackState}
        currentStep={currentPlaybackStep}
        errorMessage={playbackError}
        onToggle={onTogglePlayback}
        onSpeedChange={onPlaybackSpeedChange}
      />

      <ResponsiveSection
        className="timeline-disclosure"
        title="日期游标与事件导航"
        summary={appliedFilter.referenceDate || '未选择参考日期'}
      >
        <section
          className="timeline-interaction"
          aria-labelledby="timeline-cursor-title"
        >
          <div className="timeline-interaction__heading">
            <h3 id="timeline-cursor-title">参考日期游标</h3>
            <span>{appliedFilter.referenceDate || '未选择参考日期'}</span>
          </div>
          <input
            type="range"
            min={0}
            max={timelineMaximumIndex}
            step={1}
            value={sliderIndex.ok ? sliderIndex.value : 0}
            disabled={!sliderAvailable}
            aria-label="参考日期游标，可用方向键按日调整"
            aria-valuetext={appliedFilter.referenceDate || '未选择参考日期'}
            onChange={(event) =>
              onReferenceDateChange(
                timelineIndexToDate(Number(event.currentTarget.value)),
              )
            }
          />
          {!sliderAvailable ? (
            <p>先应用合法参考日期后才启用游标；T6/TU 状态不使用日期定位。</p>
          ) : null}
          <div className="timeline-navigation" aria-label="事件日期导航">
            <button
              type="button"
              disabled={!neighbors.previous}
              aria-describedby="timeline-same-day-note"
              onClick={(event) => {
                if (neighbors.previous) {
                  onActivate(
                    'event',
                    neighbors.previous.eventId,
                    event.currentTarget,
                    neighbors.previous.date,
                  )
                }
              }}
            >
              上一事件
            </button>
            <button
              type="button"
              disabled={!neighbors.next}
              aria-describedby="timeline-same-day-note"
              onClick={(event) => {
                if (neighbors.next) {
                  onActivate(
                    'event',
                    neighbors.next.eventId,
                    event.currentTarget,
                    neighbors.next.date,
                  )
                }
              }}
            >
              下一事件
            </button>
          </div>
          <p id="timeline-same-day-note">
            上一/下一只导航有合法日期的
            event；同日稳定次序不代表更细的历史先后。
          </p>
        </section>
      </ResponsiveSection>

      <ResponsiveSection
        className="timeline-disclosure"
        title="日期轨"
        summary={`${timelineView.dated.length} 项`}
      >
        <section
          className="timeline-track"
          aria-labelledby="timeline-dated-title"
        >
          <h3 id="timeline-dated-title">日期轨</h3>
          {timelineEmptyMessage ? (
            <p className="timeline-empty">{timelineEmptyMessage}</p>
          ) : null}
          {sliderIndex.ok && timelineEmptyMessage ? (
            <p>
              最近前一事件：{neighbors.previous?.label ?? '无'}；最近后一事件：
              {neighbors.next?.label ?? '无'}。
            </p>
          ) : null}
          <div className="timeline-track__scale" aria-hidden="true">
            <span>{TOPIC_START_DATE}</span>
            <span>{TOPIC_END_DATE}</span>
          </div>
          <ol className="timeline-track__rows">
            {timelineView.dated.map((item) => {
              const selected =
                item.objectType === 'event'
                  ? selectedEventId === item.objectId
                  : selectedRouteSegmentId === item.objectId
              const activationDate = item.timeStart ?? item.timeEnd ?? undefined
              return (
                <li key={`${item.objectType}:${item.objectId}`}>
                  <span className="timeline-track__label">
                    {item.objectType === 'event' ? '事件' : '路线段'} ·{' '}
                    {item.label}
                  </span>
                  <div className="timeline-track__lane">
                    <button
                      type="button"
                      className={`timeline-item timeline-item--${item.objectType} timeline-item--${item.shape}`}
                      style={itemStyle(item)}
                      aria-pressed={selected}
                      aria-label={`时间轴${item.objectType === 'event' ? '事件' : '路线段'} ${item.objectId}；${precisionLabels[item.timePrecision]}；原时间：${item.timeOriginalText}`}
                      onClick={(event) =>
                        onActivate(
                          item.objectType,
                          item.objectId,
                          event.currentTarget,
                          item.objectType === 'event'
                            ? activationDate
                            : undefined,
                        )
                      }
                    >
                      <span>{item.timePrecision}</span>
                    </button>
                  </div>
                  <small>
                    {precisionLabels[item.timePrecision]}；原时间：
                    {item.timeOriginalText}；标准范围：
                    {item.timeStart ?? '开放起点'} 至{' '}
                    {item.timeEnd ?? '开放终点'}
                  </small>
                </li>
              )
            })}
          </ol>
        </section>
      </ResponsiveSection>

      <ResponsiveSection
        className="timeline-disclosure"
        title="仅顺序（T6）"
        summary={`${timelineView.sequenceOnly.length} 项`}
      >
        <section
          className="timeline-undated"
          aria-labelledby="timeline-sequence-title"
        >
          <h3 id="timeline-sequence-title">日期不详，仅知顺序（T6）</h3>
          <p>
            T6 相邻只表示已有顺序，不代表真实时间间隔；event
            当前未建立可比较顺序。
          </p>
          <ul>
            {timelineView.sequenceOnly.map((item) => (
              <li key={`${item.objectType}:${item.objectId}`}>
                <button
                  type="button"
                  aria-label={`T6时间轴${item.objectType === 'event' ? '事件' : '路线段'} ${item.objectId}；${item.sequenceNo === null ? '未建立可比较顺序' : `既有顺序 ${item.sequenceNo}`}；原时间：${item.timeOriginalText}`}
                  aria-pressed={
                    item.objectType === 'event'
                      ? selectedEventId === item.objectId
                      : selectedRouteSegmentId === item.objectId
                  }
                  onClick={(event) =>
                    onActivate(
                      item.objectType,
                      item.objectId,
                      event.currentTarget,
                    )
                  }
                >
                  {item.objectType === 'event' ? '事件' : '路线段'} ·{' '}
                  {item.label} ·{' '}
                  {item.sequenceNo === null
                    ? '未建立可比较顺序'
                    : `既有顺序 ${item.sequenceNo}`}
                </button>
                <small>原时间：{item.timeOriginalText}</small>
              </li>
            ))}
          </ul>
        </section>
      </ResponsiveSection>

      <ResponsiveSection
        className="timeline-disclosure"
        title="时间未知（TU）"
        summary={`${timelineView.unknown.length} 项`}
      >
        <section
          className="timeline-undated"
          aria-labelledby="timeline-unknown-title"
        >
          <h3 id="timeline-unknown-title">时间未知（TU）</h3>
          <p>TU 不表示日期或顺序，也不参与日期导航。</p>
          <ul>
            {timelineView.unknown.map((item) => (
              <li key={`${item.objectType}:${item.objectId}`}>
                <button
                  type="button"
                  aria-label={`TU时间轴${item.objectType === 'event' ? '事件' : '路线段'} ${item.objectId}；原时间或缺口状态：${item.timeOriginalText}`}
                  aria-pressed={
                    item.objectType === 'event'
                      ? selectedEventId === item.objectId
                      : selectedRouteSegmentId === item.objectId
                  }
                  onClick={(event) =>
                    onActivate(
                      item.objectType,
                      item.objectId,
                      event.currentTarget,
                    )
                  }
                >
                  {item.objectType === 'event' ? '事件' : '路线段'} ·{' '}
                  {item.label}
                </button>
                <small>原时间或缺口状态：{item.timeOriginalText}</small>
              </li>
            ))}
          </ul>
        </section>
      </ResponsiveSection>
      <p className="timeline-causality-note">
        时间轴视觉相邻不自动表示因果、参与或其他关联；区间条内位置不表示逐日行动位置。
      </p>
    </footer>
  )
}
