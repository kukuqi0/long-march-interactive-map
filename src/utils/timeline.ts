import type { HistoricalEvent } from '../types/event'
import type { Route, RouteSegment } from '../types/route'
import {
  TOPIC_END_DATE,
  TOPIC_START_DATE,
  type TimelineDatedItem,
  type TimelineDateIssue,
  type TimelineNeighbors,
  type TimelineNavigationTarget,
  type TimelineView,
} from '../types/timeline'
import type {
  TemporalObjectInput,
  TimeComparisonIssue,
} from '../types/timeFilter'
import { classifyTemporalObject, isIsoCalendarDate } from './timeFilter'

const DAY_MS = 86_400_000
const datedPrecisions = new Set(['T0', 'T1', 'T2', 'T3', 'T4', 'T5'])

function ordinal(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS)
}

export function dateFromOrdinal(value: number) {
  return new Date(value * DAY_MS).toISOString().slice(0, 10)
}

export function validateTimelineDate(value: string): TimelineDateIssue | null {
  if (!value) {
    return {
      object_type: 'timeline',
      object_id: 'timeline_cursor',
      field: 'reference_date',
      code: 'EMPTY_DATE',
      reason:
        '尚未选择参考日期；时间游标不会默认采用今天、专题首日或第一条事件。',
    }
  }
  if (!isIsoCalendarDate(value)) {
    return {
      object_type: 'timeline',
      object_id: 'timeline_cursor',
      field: 'reference_date',
      code: 'INVALID_DATE',
      reason: '参考日期必须是合法的 YYYY-MM-DD 日历日期。',
    }
  }
  if (value < TOPIC_START_DATE || value > TOPIC_END_DATE) {
    return {
      object_type: 'timeline',
      object_id: 'timeline_cursor',
      field: 'reference_date',
      code: 'DATE_OUT_OF_RANGE',
      reason: `参考日期必须位于专题核心范围 ${TOPIC_START_DATE} 至 ${TOPIC_END_DATE}。`,
    }
  }
  return null
}

export function timelineDateToIndex(value: string) {
  const error = validateTimelineDate(value)
  if (error) return { ok: false as const, error }
  return {
    ok: true as const,
    value: ordinal(value) - ordinal(TOPIC_START_DATE),
  }
}

export function timelineIndexToDate(value: number) {
  const minimum = ordinal(TOPIC_START_DATE)
  const maximum = ordinal(TOPIC_END_DATE)
  const rounded = Math.min(
    maximum,
    Math.max(minimum, minimum + Math.round(value)),
  )
  return dateFromOrdinal(rounded)
}

export const timelineMaximumIndex =
  ordinal(TOPIC_END_DATE) - ordinal(TOPIC_START_DATE)

function percent(date: string) {
  return (
    ((ordinal(date) - ordinal(TOPIC_START_DATE)) / timelineMaximumIndex) * 100
  )
}

function inputForEvent(event: HistoricalEvent): TemporalObjectInput {
  return {
    objectType: 'event',
    objectId: event.event_id,
    timeStart: event.time_start,
    timeEnd: event.time_end,
    timePrecision: event.time_precision,
    timeOriginalText: event.time_original_text,
  }
}

function inputForSegment(segment: RouteSegment): TemporalObjectInput {
  return {
    objectType: 'route_segment',
    objectId: segment.route_segment_id,
    timeStart: segment.time_start,
    timeEnd: segment.time_end,
    timePrecision: segment.time_precision,
    timeOriginalText: segment.time_original_text,
  }
}

function datedItem(
  input: TemporalObjectInput,
  label: string,
): TimelineDatedItem {
  const shape =
    input.timeStart === null
      ? 'open-start'
      : input.timeEnd === null
        ? 'open-end'
        : input.timeStart === input.timeEnd &&
            (input.timePrecision === 'T0' || input.timePrecision === 'T1')
          ? 'node'
          : 'interval'
  return {
    objectType: input.objectType,
    objectId: input.objectId,
    label,
    timeOriginalText: input.timeOriginalText,
    timePrecision: input.timePrecision,
    timeStart: input.timeStart,
    timeEnd: input.timeEnd,
    shape,
    startPercent: input.timeStart === null ? null : percent(input.timeStart),
    endPercent: input.timeEnd === null ? null : percent(input.timeEnd),
  }
}

function outsideRangeIssue(
  input: TemporalObjectInput,
): TimeComparisonIssue | null {
  if (
    (input.timeStart &&
      (input.timeStart < TOPIC_START_DATE ||
        input.timeStart > TOPIC_END_DATE)) ||
    (input.timeEnd &&
      (input.timeEnd < TOPIC_START_DATE || input.timeEnd > TOPIC_END_DATE))
  ) {
    return {
      object_type: input.objectType,
      object_id: input.objectId,
      field: 'time_start/time_end',
      code: 'OUTSIDE_TOPIC_RANGE',
      reason: '对象时间边界超出专题核心范围，时间轴不会扩展边界或截断对象。',
    }
  }
  return null
}

export function buildTimelineView(
  events: readonly HistoricalEvent[],
  routes: readonly Route[],
  routeSegments: readonly RouteSegment[],
  visibleEventIds: ReadonlySet<string>,
  visibleRouteSegmentIds: ReadonlySet<string>,
): TimelineView {
  const routeTitles = new Map(
    routes.map((route) => [route.route_id, route.title]),
  )
  const view: TimelineView = {
    dated: [],
    sequenceOnly: [],
    unknown: [],
    errors: [],
  }
  const add = (
    input: TemporalObjectInput,
    label: string,
    sequenceNo: number | null,
  ) => {
    const classified = classifyTemporalObject(input, TOPIC_START_DATE)
    if (!classified.ok) {
      view.errors.push(classified.error)
      return
    }
    const rangeIssue = outsideRangeIssue(input)
    if (rangeIssue) {
      view.errors.push(rangeIssue)
      return
    }
    if (classified.status === 'sequence_only') {
      view.sequenceOnly.push({
        objectType: input.objectType,
        objectId: input.objectId,
        label,
        timeOriginalText: input.timeOriginalText,
        sequenceNo,
      })
    } else if (classified.status === 'unknown') {
      view.unknown.push({
        objectType: input.objectType,
        objectId: input.objectId,
        label,
        timeOriginalText: input.timeOriginalText,
      })
    } else if (datedPrecisions.has(input.timePrecision)) {
      view.dated.push(datedItem(input, label))
    }
  }

  events.forEach((event) => {
    if (visibleEventIds.has(event.event_id))
      add(inputForEvent(event), event.title, null)
  })
  routeSegments.forEach((segment) => {
    if (visibleRouteSegmentIds.has(segment.route_segment_id)) {
      add(
        inputForSegment(segment),
        `${routeTitles.get(segment.route_id) ?? segment.route_id} · 路段${segment.sequence_no}`,
        segment.sequence_no,
      )
    }
  })
  view.dated.sort((a, b) =>
    (a.timeStart ?? a.timeEnd ?? '').localeCompare(
      b.timeStart ?? b.timeEnd ?? '',
    ),
  )
  view.sequenceOnly.sort((a, b) => {
    if (a.objectType !== b.objectType)
      return a.objectType.localeCompare(b.objectType)
    return (
      (a.sequenceNo ?? Number.MAX_SAFE_INTEGER) -
      (b.sequenceNo ?? Number.MAX_SAFE_INTEGER)
    )
  })
  return view
}

export function timelineItemIsCurrent(
  item: TimelineDatedItem,
  referenceDate: string,
) {
  const result = classifyTemporalObject(
    {
      objectType: item.objectType,
      objectId: item.objectId,
      timeStart: item.timeStart,
      timeEnd: item.timeEnd,
      timePrecision: item.timePrecision,
      timeOriginalText: item.timeOriginalText,
    },
    referenceDate,
  )
  return result.ok && result.status === 'current'
}

export function findEventNeighbors(
  events: readonly HistoricalEvent[],
  referenceDate: string,
): TimelineNeighbors {
  if (validateTimelineDate(referenceDate)) return { previous: null, next: null }
  const candidates = events
    .map((event, originalIndex) => ({ event, originalIndex }))
    .filter(({ event }) => datedPrecisions.has(event.time_precision))
    .filter(({ event }) => {
      const result = classifyTemporalObject(inputForEvent(event), referenceDate)
      return result.ok
    })
  const previous = candidates
    .filter(
      ({ event }) => event.time_end !== null && event.time_end < referenceDate,
    )
    .sort(
      (a, b) =>
        b.event.time_end!.localeCompare(a.event.time_end!) ||
        a.originalIndex - b.originalIndex,
    )[0]
  const next = candidates
    .filter(
      ({ event }) =>
        event.time_start !== null && referenceDate < event.time_start,
    )
    .sort(
      (a, b) =>
        a.event.time_start!.localeCompare(b.event.time_start!) ||
        a.originalIndex - b.originalIndex,
    )[0]
  const target = (
    candidate: (typeof candidates)[number] | undefined,
    boundary: 'time_start' | 'time_end',
  ): TimelineNavigationTarget | null =>
    candidate
      ? {
          eventId: candidate.event.event_id,
          label: candidate.event.title,
          date: candidate.event[boundary]!,
          originalIndex: candidate.originalIndex,
        }
      : null
  return {
    previous: target(previous, 'time_end'),
    next: target(next, 'time_start'),
  }
}
