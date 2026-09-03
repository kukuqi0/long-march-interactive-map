import { describe, expect, it } from 'vitest'
import type { HistoricalEvent, TimePrecision } from '../types/event'
import type { RouteSegment } from '../types/route'
import {
  buildTimeFilterResult,
  classifyTemporalObject,
  filterEventDataset,
  filterRouteDataset,
  isIsoCalendarDate,
  validateTimeFilter,
} from './timeFilter'
import { loadT04PlaceDataset } from '../data/loaders/loadPlaces'
import { loadT05EventDataset } from '../data/loaders/loadEvents'
import { loadT06PreOrganizationDataset } from '../data/loaders/loadOrganizations'
import { loadT06RouteDataset } from '../data/loaders/loadRoutes'

function classify(
  precision: TimePrecision,
  start: string | null,
  end: string | null,
  referenceDate = '1935-02-15',
) {
  return classifyTemporalObject(
    {
      objectType: 'event',
      objectId: 'event_fixture',
      timeStart: start,
      timeEnd: end,
      timePrecision: precision,
      timeOriginalText: '这段原时间文本不得参与解析或被修改',
    },
    referenceDate,
  )
}

function statusOf(result: ReturnType<typeof classify>) {
  if (!result.ok) throw new Error(result.error.code)
  return result.status
}

describe('strict ISO calendar dates', () => {
  it.each(['1936-02-29', '1935-01-01', '1935-04-30', '2000-02-29'])(
    'accepts %s',
    (value) => expect(isIsoCalendarDate(value)).toBe(true),
  )

  it.each([
    '1935-02-29',
    '1935-02-30',
    '1935-04-31',
    '1935-00-01',
    '1935-13-01',
    '1935-01-00',
    '1935-1-01',
    '1935/01/01',
    '',
  ])('rejects %s without normalization', (value) =>
    expect(isIsoCalendarDate(value)).toBe(false),
  )
})

describe('inclusive temporal classification', () => {
  it.each(['T0', 'T1'] as const)(
    '%s uses the stored inclusive date boundary',
    (precision) => {
      expect(statusOf(classify(precision, '1935-02-15', '1935-02-15'))).toBe(
        'current',
      )
    },
  )

  it('classifies the day before, on and after a T1 date', () => {
    expect(
      statusOf(classify('T1', '1935-02-15', '1935-02-15', '1935-02-14')),
    ).toBe('future')
    expect(
      statusOf(classify('T1', '1935-02-15', '1935-02-15', '1935-02-15')),
    ).toBe('current')
    expect(
      statusOf(classify('T1', '1935-02-15', '1935-02-15', '1935-02-16')),
    ).toBe('completed')
  })

  it.each([
    ['T2', '1935-02-01', '1935-02-10'],
    ['T2', '1935-02-11', '1935-02-20'],
    ['T2', '1935-02-21', '1935-02-28'],
    ['T2', '1936-02-21', '1936-02-29'],
    ['T3', '1935-02-01', '1935-02-28'],
    ['T3', '1936-02-01', '1936-02-29'],
    ['T3', '1935-04-01', '1935-04-30'],
    ['T3', '1935-01-01', '1935-01-31'],
    ['T4', '1934-12-29', '1935-01-03'],
    ['T5', '1935-01-01', '1935-12-31'],
  ] as const)(
    'keeps the full %s interval %s to %s',
    (precision, start, end) => {
      expect(statusOf(classify(precision, start, end, start))).toBe('current')
      expect(statusOf(classify(precision, start, end, end))).toBe('current')
    },
  )

  it('handles open intervals without guessing the missing boundary', () => {
    expect(statusOf(classify('T4', '1935-02-15', null, '1935-02-14'))).toBe(
      'future',
    )
    expect(statusOf(classify('T4', '1935-02-15', null, '1935-02-15'))).toBe(
      'current',
    )
    expect(statusOf(classify('T4', null, '1935-02-15', '1935-02-15'))).toBe(
      'current',
    )
    expect(statusOf(classify('T4', null, '1935-02-15', '1935-02-16'))).toBe(
      'completed',
    )
  })

  it('keeps T6 and TU separate and outside date states', () => {
    expect(statusOf(classify('T6', null, null))).toBe('sequence_only')
    expect(statusOf(classify('TU', null, null))).toBe('unknown')
  })

  it.each([
    ['T6', '1935-01-01', null],
    ['TU', null, '1935-01-01'],
    ['T4', null, null],
  ] as const)(
    'rejects the invalid %s null/date combination',
    (precision, start, end) => {
      const result = classify(precision, start, end)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('INVALID_TIME_COMBINATION')
    },
  )

  it('rejects reversed and invalid dates without repair', () => {
    const reversed = classify('T4', '1935-03-01', '1935-02-01')
    expect(reversed.ok).toBe(false)
    if (!reversed.ok) expect(reversed.error.code).toBe('REVERSED_TIME_RANGE')
    const invalid = classify('T3', '1935-02-01', '1935-02-30')
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.error.code).toBe('INVALID_DATE')
  })
})

describe('shared event and route filtering', () => {
  const placeDataset = loadT04PlaceDataset()
  const eventDataset = loadT05EventDataset(placeDataset)
  const routeDataset = loadT06RouteDataset(
    placeDataset,
    loadT06PreOrganizationDataset(),
  )

  it('all preserves every ID and original order', () => {
    const result = buildTimeFilterResult(
      eventDataset.events,
      routeDataset.routeSegments,
      {
        status: 'all',
        referenceDate: '',
      },
    )
    expect([...result.eventIds]).toEqual(
      eventDataset.events.map((event) => event.event_id),
    )
    expect([...result.routeSegmentIds]).toEqual(
      routeDataset.routeSegments.map((segment) => segment.route_segment_id),
    )
  })

  it('uses one classification for completed/current/future', () => {
    const referenceDate = '1934-11-03'
    const counts = ['completed', 'current', 'future'].map((status) => {
      const result = buildTimeFilterResult(
        eventDataset.events,
        routeDataset.routeSegments,
        {
          status: status as 'completed' | 'current' | 'future',
          referenceDate,
        },
      )
      return [result.eventIds.size, result.routeSegmentIds.size]
    })
    expect(counts).toEqual([
      [1, 2],
      [1, 1],
      [6, 3],
    ])
  })

  it('selects only T6 for sequence_only and only TU for unknown', () => {
    const sequence = buildTimeFilterResult(
      eventDataset.events,
      routeDataset.routeSegments,
      {
        status: 'sequence_only',
        referenceDate: '',
      },
    )
    const unknown = buildTimeFilterResult(
      eventDataset.events,
      routeDataset.routeSegments,
      {
        status: 'unknown',
        referenceDate: '',
      },
    )
    expect(sequence.eventIds.size).toBe(1)
    expect(sequence.routeSegmentIds.size).toBe(1)
    expect(unknown.eventIds.size).toBe(1)
    expect(unknown.routeSegmentIds.size).toBe(1)
  })

  it('filters lists and geometries by the same object IDs without mutation', () => {
    const beforeEvents = structuredClone(eventDataset)
    const beforeRoutes = structuredClone(routeDataset)
    const result = buildTimeFilterResult(
      eventDataset.events,
      routeDataset.routeSegments,
      {
        status: 'current',
        referenceDate: '1934-11-03',
      },
    )
    const events = filterEventDataset(eventDataset, result.eventIds)
    const routes = filterRouteDataset(routeDataset, result.routeSegmentIds)
    expect(
      events.featureCollection.features.every((feature) =>
        result.eventIds.has(feature.properties.event_id),
      ),
    ).toBe(true)
    expect(routes.featureCollection.features).toHaveLength(2)
    expect(
      new Set(
        routes.featureCollection.features.map(
          (feature) => feature.properties.alternative_id,
        ),
      ),
    ).toEqual(new Set(['A', 'B']))
    expect(eventDataset).toEqual(beforeEvents)
    expect(routeDataset).toEqual(beforeRoutes)
  })

  it('does not use or mutate original time text', () => {
    const event = structuredClone(eventDataset.events[0]) as HistoricalEvent
    event.time_original_text = '1935-02-30（仅原文，不参与解析）'
    const before = structuredClone(event)
    const result = buildTimeFilterResult([event], [], {
      status: 'future',
      referenceDate: '1934-01-01',
    })
    expect(result.eventIds.has(event.event_id)).toBe(true)
    expect(event).toEqual(before)
  })

  it('returns a structured filter input error', () => {
    const error = validateTimeFilter({
      status: 'current',
      referenceDate: '1935-02-30',
    })
    expect(error).toMatchObject({
      object_type: 'time_filter',
      field: 'reference_date',
      code: 'INVALID_REFERENCE_DATE',
    })
  })

  it('accepts defensive readonly inputs without writing to them', () => {
    const event = Object.freeze(
      structuredClone(eventDataset.events[0]),
    ) as HistoricalEvent
    const segment = Object.freeze(
      structuredClone(routeDataset.routeSegments[0]),
    ) as RouteSegment
    expect(() =>
      buildTimeFilterResult([event], [segment], {
        status: 'current',
        referenceDate: '1934-10-01',
      }),
    ).not.toThrow()
  })
})
