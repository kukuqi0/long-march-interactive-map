import type { HistoricalEvent, LoadedEventDataset } from '../types/event'
import type { LoadedRouteDataset, RouteSegment } from '../types/route'
import type {
  AppliedTimeFilter,
  TemporalClassification,
  TemporalObjectInput,
  TimeComparisonIssue,
  TimeFilterResult,
  TimeFilterStatus,
} from '../types/timeFilter'

const dateStatus = new Set<TimeFilterStatus>(['completed', 'current', 'future'])
const datedPrecisions = new Set(['T0', 'T1', 'T2', 'T3', 'T4', 'T5'])

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    return leap ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function isIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  )
}

function issue(
  input: TemporalObjectInput,
  field: string,
  code: string,
  reason: string,
): TemporalClassification {
  return {
    ok: false,
    error: {
      object_type: input.objectType,
      object_id: input.objectId,
      field,
      code,
      reason,
    },
  }
}

export function validateTimeFilter(
  filter: AppliedTimeFilter,
): TimeComparisonIssue | null {
  if (!dateStatus.has(filter.status)) return null
  if (!isIsoCalendarDate(filter.referenceDate)) {
    return {
      object_type: 'time_filter',
      object_id: 'active_time_filter',
      field: 'reference_date',
      code: 'INVALID_REFERENCE_DATE',
      reason: '已完成、当前或未来筛选需要合法的 YYYY-MM-DD 参考日期。',
    }
  }
  return null
}

export function classifyTemporalObject(
  input: TemporalObjectInput,
  referenceDate: string,
): TemporalClassification {
  if (input.timeStart !== null && !isIsoCalendarDate(input.timeStart)) {
    return issue(
      input,
      'time_start',
      'INVALID_DATE',
      'time_start 不是合法的 YYYY-MM-DD 日历日期。',
    )
  }
  if (input.timeEnd !== null && !isIsoCalendarDate(input.timeEnd)) {
    return issue(
      input,
      'time_end',
      'INVALID_DATE',
      'time_end 不是合法的 YYYY-MM-DD 日历日期。',
    )
  }

  if (input.timePrecision === 'T6') {
    return input.timeStart === null && input.timeEnd === null
      ? { ok: true, status: 'sequence_only' }
      : issue(
          input,
          'time_precision',
          'INVALID_TIME_COMBINATION',
          'T6 仅顺序记录的起止日期必须同时为 null。',
        )
  }
  if (input.timePrecision === 'TU') {
    return input.timeStart === null && input.timeEnd === null
      ? { ok: true, status: 'unknown' }
      : issue(
          input,
          'time_precision',
          'INVALID_TIME_COMBINATION',
          'TU 时间未知记录的起止日期必须同时为 null。',
        )
  }
  if (!datedPrecisions.has(input.timePrecision)) {
    return issue(
      input,
      'time_precision',
      'INVALID_TIME_PRECISION',
      '时间精度不属于 T0—TU。',
    )
  }
  if (input.timeStart === null && input.timeEnd === null) {
    return issue(
      input,
      'time_start',
      'INVALID_TIME_COMBINATION',
      '有日期精度的对象不能同时缺少起止日期。',
    )
  }
  if (
    input.timeStart !== null &&
    input.timeEnd !== null &&
    input.timeStart > input.timeEnd
  ) {
    return issue(
      input,
      'time_end',
      'REVERSED_TIME_RANGE',
      'time_end 不能早于 time_start；系统不会自动交换边界。',
    )
  }
  if (!isIsoCalendarDate(referenceDate)) {
    return issue(
      input,
      'reference_date',
      'INVALID_REFERENCE_DATE',
      '参考日期不是合法的 YYYY-MM-DD 日历日期。',
    )
  }

  if (input.timeStart === null) {
    return {
      ok: true,
      status: referenceDate <= input.timeEnd! ? 'current' : 'completed',
    }
  }
  if (input.timeEnd === null) {
    return {
      ok: true,
      status: referenceDate < input.timeStart ? 'future' : 'current',
    }
  }
  if (input.timeEnd < referenceDate) return { ok: true, status: 'completed' }
  if (referenceDate < input.timeStart) return { ok: true, status: 'future' }
  return { ok: true, status: 'current' }
}

function eventInput(event: HistoricalEvent): TemporalObjectInput {
  return {
    objectType: 'event',
    objectId: event.event_id,
    timeStart: event.time_start,
    timeEnd: event.time_end,
    timePrecision: event.time_precision,
    timeOriginalText: event.time_original_text,
  }
}

function routeSegmentInput(segment: RouteSegment): TemporalObjectInput {
  return {
    objectType: 'route_segment',
    objectId: segment.route_segment_id,
    timeStart: segment.time_start,
    timeEnd: segment.time_end,
    timePrecision: segment.time_precision,
    timeOriginalText: segment.time_original_text,
  }
}

export function buildTimeFilterResult(
  events: readonly HistoricalEvent[],
  routeSegments: readonly RouteSegment[],
  filter: AppliedTimeFilter,
): TimeFilterResult {
  if (filter.status === 'all') {
    return {
      eventIds: new Set(events.map((event) => event.event_id)),
      routeSegmentIds: new Set(
        routeSegments.map((segment) => segment.route_segment_id),
      ),
      errors: [],
    }
  }

  const filterError = validateTimeFilter(filter)
  if (filterError) {
    return {
      eventIds: new Set(),
      routeSegmentIds: new Set(),
      errors: [filterError],
    }
  }

  const eventIds = new Set<string>()
  const routeSegmentIds = new Set<string>()
  const errors: TimeComparisonIssue[] = []
  for (const event of events) {
    const result = classifyTemporalObject(
      eventInput(event),
      filter.referenceDate,
    )
    if (!result.ok) errors.push(result.error)
    else if (result.status === filter.status) eventIds.add(event.event_id)
  }
  for (const segment of routeSegments) {
    const result = classifyTemporalObject(
      routeSegmentInput(segment),
      filter.referenceDate,
    )
    if (!result.ok) errors.push(result.error)
    else if (result.status === filter.status)
      routeSegmentIds.add(segment.route_segment_id)
  }
  return { eventIds, routeSegmentIds, errors }
}

export function filterEventDataset(
  dataset: LoadedEventDataset,
  visibleIds: ReadonlySet<string>,
): LoadedEventDataset {
  return {
    ...dataset,
    events: dataset.events.filter((event) => visibleIds.has(event.event_id)),
    featureCollection: {
      ...dataset.featureCollection,
      features: dataset.featureCollection.features.filter((feature) =>
        visibleIds.has(feature.properties.event_id),
      ),
    },
    unmapped: dataset.unmapped.filter((item) => visibleIds.has(item.event_id)),
  }
}

export function filterRouteDataset(
  dataset: LoadedRouteDataset,
  visibleIds: ReadonlySet<string>,
): LoadedRouteDataset {
  return {
    ...dataset,
    routeSegments: dataset.routeSegments.filter((segment) =>
      visibleIds.has(segment.route_segment_id),
    ),
    featureCollection: {
      ...dataset.featureCollection,
      features: dataset.featureCollection.features.filter((feature) =>
        visibleIds.has(feature.properties.route_segment_id),
      ),
    },
    unmapped: dataset.unmapped.filter((item) =>
      visibleIds.has(item.route_segment_id),
    ),
  }
}
