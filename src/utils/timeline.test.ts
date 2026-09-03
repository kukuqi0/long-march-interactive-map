import { describe, expect, it } from 'vitest'
import type { HistoricalEvent, TimePrecision } from '../types/event'
import type { Route, RouteSegment } from '../types/route'
import { TOPIC_END_DATE, TOPIC_START_DATE } from '../types/timeline'
import {
  buildTimelineView,
  findEventNeighbors,
  timelineDateToIndex,
  timelineIndexToDate,
  timelineItemIsCurrent,
  validateTimelineDate,
} from './timeline'

function event(
  id: string,
  precision: TimePrecision,
  start: string | null,
  end: string | null,
): HistoricalEvent {
  return {
    event_id: id,
    topic_id: 'topic_test',
    title: `测试事件 ${id}`,
    event_type: 'other',
    time_original_text: `原时间 ${id}`,
    time_start: start,
    time_end: end,
    time_precision: precision,
    place_id: null,
    spatial_precision: 'SU',
    summary: null,
    review_status: 'draft',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    data_version: 'test',
  }
}

const route: Route = {
  route_id: 'route_test',
  topic_id: 'topic_test',
  organization_id: 'org_test',
  title: '测试路线',
  route_role: 'main',
  review_status: 'draft',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  data_version: 'test',
}

function segment(
  id: string,
  precision: TimePrecision,
  start: string | null,
  end: string | null,
  sequenceNo = 1,
): RouteSegment {
  return {
    route_segment_id: id,
    route_id: route.route_id,
    sequence_no: sequenceNo,
    organization_id: 'org_test',
    from_place_id: null,
    to_place_id: null,
    time_original_text: `原时间 ${id}`,
    time_start: start,
    time_end: end,
    time_precision: precision,
    movement_type: 'unknown',
    route_certainty: 'RU',
    spatial_precision: 'SU',
    geometry_ref: null,
    geometry_method: 'none',
    uncertainty_note: '测试夹具',
    review_status: 'draft',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    data_version: 'test',
  }
}

function view(events: HistoricalEvent[], segments: RouteSegment[] = []) {
  return buildTimelineView(
    events,
    [route],
    segments,
    new Set(events.map((item) => item.event_id)),
    new Set(segments.map((item) => item.route_segment_id)),
  )
}

describe('timeline pure derivation', () => {
  it('accepts the frozen topic boundaries and rejects empty, invalid and out-of-range dates', () => {
    expect(validateTimelineDate(TOPIC_START_DATE)).toBeNull()
    expect(validateTimelineDate(TOPIC_END_DATE)).toBeNull()
    expect(validateTimelineDate('')?.code).toBe('EMPTY_DATE')
    expect(validateTimelineDate('1935-02-29')?.code).toBe('INVALID_DATE')
    expect(validateTimelineDate('1936-02-29')).toBeNull()
    expect(validateTimelineDate('1934-09-30')?.code).toBe('DATE_OUT_OF_RANGE')
    expect(validateTimelineDate('1936-11-01')?.code).toBe('DATE_OUT_OF_RANGE')
  })

  it('maps every legal date to a stable integer cursor index and back', () => {
    for (const date of [
      '1934-10-01',
      '1935-01-15',
      '1936-02-29',
      '1936-10-31',
    ]) {
      const result = timelineDateToIndex(date)
      expect(result.ok).toBe(true)
      if (result.ok) expect(timelineIndexToDate(result.value)).toBe(date)
    }
    expect(timelineIndexToDate(-100)).toBe(TOPIC_START_DATE)
    expect(timelineIndexToDate(99999)).toBe(TOPIC_END_DATE)
  })

  it.each([
    ['T0', '1934-10-02', '1934-10-02', 'node'],
    ['T1', '1934-10-03', '1934-10-03', 'node'],
    ['T2', '1934-10-11', '1934-10-20', 'interval'],
    ['T3', '1934-11-01', '1934-11-30', 'interval'],
    ['T4', '1934-12-30', '1935-01-02', 'interval'],
    ['T5', '1935-01-01', '1935-12-31', 'interval'],
  ] as const)(
    'represents %s without compressing its stored bounds',
    (precision, start, end, shape) => {
      const result = view([event(`event_${precision}`, precision, start, end)])
      expect(result.errors).toEqual([])
      expect(result.dated[0]).toMatchObject({
        timePrecision: precision,
        timeStart: start,
        timeEnd: end,
        shape,
        timeOriginalText: `原时间 event_${precision}`,
      })
    },
  )

  it('does not invent a T0 time of day when the accepted model stores only dates', () => {
    const result = view([event('event_t0', 'T0', '1935-01-01', '1935-01-01')])
    expect(result.dated[0].timeStart).toBe('1935-01-01')
    expect(JSON.stringify(result)).not.toMatch(/T\d{2}:\d{2}/)
  })

  it('keeps open interval ends open instead of substituting topic boundaries', () => {
    const result = view([
      event('open_start', 'T4', null, '1935-02-01'),
      event('open_end', 'T4', '1935-03-01', null),
    ])
    expect(result.dated.map((item) => item.shape)).toEqual([
      'open-start',
      'open-end',
    ])
    expect(result.dated[0].startPercent).toBeNull()
    expect(result.dated[1].endPercent).toBeNull()
  })

  it('places T6 only on the order track and TU only in the unknown region', () => {
    const result = view(
      [
        event('event_t6', 'T6', null, null),
        event('event_tu', 'TU', null, null),
      ],
      [
        segment('seg_t6', 'T6', null, null, 7),
        segment('seg_tu', 'TU', null, null),
      ],
    )
    expect(result.dated).toEqual([])
    expect(
      result.sequenceOnly.map((item) => [item.objectId, item.sequenceNo]),
    ).toEqual([
      ['event_t6', null],
      ['seg_t6', 7],
    ])
    expect(result.unknown.map((item) => item.objectId)).toEqual([
      'event_tu',
      'seg_tu',
    ])
  })

  it('reports invalid null combinations, reverse ranges and extended boundaries without repair', () => {
    const result = view([
      event('null_dated', 'T4', null, null),
      event('reverse', 'T4', '1935-02-02', '1935-02-01'),
      event('outside', 'T1', '1937-01-01', '1937-01-01'),
    ])
    expect(result.dated).toEqual([])
    expect(result.errors.map((error) => error.code)).toEqual([
      'INVALID_TIME_COMBINATION',
      'REVERSED_TIME_RANGE',
      'OUTSIDE_TOPIC_RANGE',
    ])
  })

  it('uses inclusive current classification for timeline items', () => {
    const item = view([event('range', 'T4', '1935-03-01', '1935-03-03')])
      .dated[0]
    expect(timelineItemIsCurrent(item, '1935-03-01')).toBe(true)
    expect(timelineItemIsCurrent(item, '1935-03-03')).toBe(true)
    expect(timelineItemIsCurrent(item, '1935-03-04')).toBe(false)
  })

  it('navigates only dated events, excludes current intervals, and never uses route segments', () => {
    const events = [
      event('previous', 'T1', '1934-10-02', '1934-10-02'),
      event('current_range', 'T4', '1934-11-01', '1934-11-10'),
      event('next', 'T1', '1935-01-03', '1935-01-03'),
      event('t6', 'T6', null, null),
      event('tu', 'TU', null, null),
    ]
    expect(findEventNeighbors(events, '1934-11-03')).toMatchObject({
      previous: { eventId: 'previous', date: '1934-10-02' },
      next: { eventId: 'next', date: '1935-01-03' },
    })
  })

  it('keeps same-day navigation deterministic by original event order without inventing finer time', () => {
    const events = [
      event('first_loaded', 'T1', '1935-01-01', '1935-01-01'),
      event('second_loaded', 'T1', '1935-01-01', '1935-01-01'),
    ]
    expect(findEventNeighbors(events, '1934-12-31').next?.eventId).toBe(
      'first_loaded',
    )
  })

  it('does not mutate source arrays or records while deriving tracks', () => {
    const events = [event('immutable', 'T1', '1935-01-01', '1935-01-01')]
    const segments = [segment('seg_immutable', 'T6', null, null)]
    const before = JSON.stringify({ events, segments, route })
    view(events, segments)
    expect(JSON.stringify({ events, segments, route })).toBe(before)
  })

  it('derives the accepted sample-scale view well below the 100ms interaction target', () => {
    const events = Array.from({ length: 9 }, (_, index) =>
      event(`event_${index}`, 'T1', '1935-01-01', '1935-01-01'),
    )
    const segments = Array.from({ length: 8 }, (_, index) =>
      segment(`seg_${index}`, 'T4', '1935-01-01', '1935-01-02', index + 1),
    )
    const durations: number[] = []
    for (let index = 0; index < 50; index += 1) {
      const started = performance.now()
      view(events, segments)
      durations.push(performance.now() - started)
    }
    expect(Math.max(...durations)).toBeLessThan(100)
  })
})
