import { describe, expect, it } from 'vitest'
import { loadT05EventDataset } from '../data/loaders/loadEvents'
import { loadT06PreOrganizationDataset } from '../data/loaders/loadOrganizations'
import { loadT04PlaceDataset } from '../data/loaders/loadPlaces'
import { loadT06RouteDataset } from '../data/loaders/loadRoutes'
import type { PlaybackIssue } from '../types/playback'
import type { RouteSegment } from '../types/route'
import {
  buildPlaybackPlan,
  findPlaybackStartIndex,
  initialPlaybackState,
  playbackReducer,
} from './playback'

const places = loadT04PlaceDataset()
const events = loadT05EventDataset(places)
const organizations = loadT06PreOrganizationDataset()
const routes = loadT06RouteDataset(places, organizations)

function productionPlan() {
  return buildPlaybackPlan(
    events.events,
    routes.routes,
    routes.routeSegments,
    routes.featureCollection,
  )
}

describe('playback plan', () => {
  it('uses event anchors and route_segment playback steps without mutating production data', () => {
    const before = JSON.stringify({ events, routes })
    const plan = productionPlan()

    expect(plan.errors).toEqual([])
    expect(
      plan.steps.filter((step) => step.kind === 'event_anchor'),
    ).toHaveLength(8)
    expect(
      plan.steps.filter((step) => step.kind === 'route_segment'),
    ).toHaveLength(7)
    expect(JSON.stringify({ events, routes })).toBe(before)
  })

  it('excludes TU/RU and keeps T6 as a date-free discrete route step', () => {
    const plan = productionPlan()
    const routeSteps = plan.steps.filter(
      (step) => step.kind === 'route_segment',
    )
    const t6 = routeSteps.find((step) => step.timePrecision === 'T6')

    expect(t6).toMatchObject({ anchorDate: null, hasGeometry: false })
    expect(plan.excludedRouteSegmentIds.has('seg_t06_ru_placeholder')).toBe(
      true,
    )
    expect(
      routeSteps.some(
        (step) => step.routeSegmentId === 'seg_t06_ru_placeholder',
      ),
    ).toBe(false)
  })

  it('keeps R4 as one playback step while retaining both existing alternatives', () => {
    const plan = productionPlan()
    const r4 = routes.routeSegments.find(
      (segment) => segment.route_certainty === 'R4',
    )!
    const steps = plan.steps.filter(
      (step) =>
        step.kind === 'route_segment' &&
        step.routeSegmentId === r4.route_segment_id,
    )
    const features = routes.featureCollection.features.filter(
      (feature) => feature.properties.route_segment_id === r4.route_segment_id,
    )

    expect(steps).toHaveLength(1)
    expect(features).toHaveLength(2)
    expect(
      new Set(features.map((item) => item.properties.alternative_id)).size,
    ).toBe(2)
  })

  it('preserves the production R1-R5 certainty branches and excludes RU', () => {
    const routeSteps = productionPlan().steps.filter(
      (step) => step.kind === 'route_segment',
    )
    const certainties = routeSteps.map((step) => step.routeCertainty)

    expect(certainties).toEqual(
      expect.arrayContaining(['R1', 'R2', 'R3', 'R4', 'R5']),
    )
    expect(certainties).not.toContain('RU')
    expect(
      routeSteps.find((step) => step.routeCertainty === 'R5'),
    ).toMatchObject({ hasGeometry: false, isGap: true })
  })

  it('keeps T0 as a whole-geometry trigger and excludes T5 from fine playback', () => {
    const baseEvent = events.events.find(
      (event) => event.time_precision === 'T1',
    )!
    const baseSegment = routes.routeSegments.find(
      (segment) => segment.route_certainty === 'R1',
    )!
    const t0Event = {
      ...baseEvent,
      event_id: 'event_t0_fixture',
      time_precision: 'T0' as const,
      time_start: '1934-10-01',
      time_end: '1934-10-01',
    }
    const t0Segment = {
      ...baseSegment,
      route_segment_id: 'seg_t0_fixture',
      time_precision: 'T0' as const,
      time_start: '1934-10-01',
      time_end: '1934-10-01',
    }
    const t5Segment = {
      ...baseSegment,
      route_segment_id: 'seg_t5_fixture',
      sequence_no: baseSegment.sequence_no + 1,
      time_precision: 'T5' as const,
      time_start: '1935-01-01',
      time_end: '1935-12-31',
    }
    const feature = routes.featureCollection.features.find(
      (item) =>
        item.properties.route_segment_id === baseSegment.route_segment_id,
    )!
    const fixtureCollection = {
      ...routes.featureCollection,
      features: [
        {
          ...feature,
          id: 'feature_t0_fixture',
          properties: {
            ...feature.properties,
            route_segment_id: t0Segment.route_segment_id,
          },
        },
      ],
    }
    const plan = buildPlaybackPlan(
      [t0Event],
      [routes.routes.find((route) => route.route_id === baseSegment.route_id)!],
      [t0Segment, t5Segment],
      fixtureCollection,
    )

    expect(plan.errors).toEqual([])
    expect(plan.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'event_anchor', timePrecision: 'T0' }),
        expect.objectContaining({
          kind: 'route_segment',
          routeSegmentId: 'seg_t0_fixture',
          timePrecision: 'T0',
          hasGeometry: true,
        }),
      ]),
    )
    expect(plan.excludedRouteSegmentIds.has('seg_t5_fixture')).toBe(true)
  })

  it('keeps T2/T3/T4 as whole interval steps rather than daily positions', () => {
    const steps = productionPlan().steps.filter(
      (step) =>
        step.kind === 'route_segment' &&
        ['T2', 'T3', 'T4'].includes(step.timePrecision),
    )
    expect(new Set(steps.map((step) => step.timePrecision))).toEqual(
      new Set(['T2', 'T3', 'T4']),
    )
    for (const step of steps) {
      expect(step).not.toHaveProperty('dailyPositions')
      expect(step).not.toHaveProperty('movingPoint')
      expect(step).not.toHaveProperty('distance')
    }
  })

  it('keeps legal open bounds unchanged and rejects invalid T6/TU dates', () => {
    const baseSegment = routes.routeSegments.find(
      (segment) => segment.route_certainty === 'R1',
    )!
    const openStart: RouteSegment = {
      ...baseSegment,
      route_segment_id: 'seg_open_start_fixture',
      time_start: '1934-10-01',
      time_end: null,
      sequence_no: 1,
    }
    const openEnd: RouteSegment = {
      ...baseSegment,
      route_segment_id: 'seg_open_end_fixture',
      time_start: null,
      time_end: '1934-10-15',
      sequence_no: 2,
    }
    const invalidT6: RouteSegment = {
      ...baseSegment,
      route_segment_id: 'seg_invalid_t6_fixture',
      time_precision: 'T6',
      time_start: '1934-10-20',
      time_end: null,
      sequence_no: 3,
    }
    const invalidTu: RouteSegment = {
      ...baseSegment,
      route_segment_id: 'seg_invalid_tu_fixture',
      time_precision: 'TU',
      time_start: null,
      time_end: '1934-10-21',
      sequence_no: 4,
    }
    const baseFeature = routes.featureCollection.features.find(
      (feature) =>
        feature.properties.route_segment_id === baseSegment.route_segment_id,
    )!
    const featureFor = (segmentId: string, suffix: string) => ({
      ...baseFeature,
      id: `feature_${suffix}`,
      properties: {
        ...baseFeature.properties,
        route_segment_id: segmentId,
      },
    })
    const before = JSON.stringify([openStart, openEnd, invalidT6, invalidTu])
    const plan = buildPlaybackPlan(
      events.events,
      [routes.routes.find((route) => route.route_id === baseSegment.route_id)!],
      [openStart, openEnd, invalidT6, invalidTu],
      {
        ...routes.featureCollection,
        features: [
          featureFor(openStart.route_segment_id, 'open_start'),
          featureFor(openEnd.route_segment_id, 'open_end'),
        ],
      },
    )

    expect(
      plan.steps.filter((step) => step.kind === 'route_segment'),
    ).toHaveLength(2)
    expect(
      plan.errors.filter((item) => item.code === 'INVALID_TIME_COMBINATION'),
    ).toHaveLength(2)
    expect(JSON.stringify([openStart, openEnd, invalidT6, invalidTu])).toBe(
      before,
    )
    expect(openStart.time_end).toBeNull()
    expect(openEnd.time_start).toBeNull()
  })

  it('reports an R4 separation error instead of selecting or merging one plan', () => {
    const r4 = routes.routeSegments.find(
      (segment) => segment.route_certainty === 'R4',
    )!
    const oneAlternative = {
      ...routes.featureCollection,
      features: routes.featureCollection.features.filter(
        (feature) =>
          feature.properties.route_segment_id !== r4.route_segment_id ||
          feature.properties.alternative_id === 'A',
      ),
    }
    const plan = buildPlaybackPlan(
      events.events,
      routes.routes,
      routes.routeSegments,
      oneAlternative,
    )

    expect(plan.errors).toContainEqual(
      expect.objectContaining({
        object_id: r4.route_segment_id,
        code: 'R4_ALTERNATIVES_NOT_SEPARATED',
      }),
    )
  })

  it('stops on duplicate sequence numbers and date/sequence conflicts', () => {
    const first = routes.routeSegments[0]
    const second = routes.routeSegments.find(
      (segment) =>
        segment.route_id === first.route_id &&
        segment.route_segment_id !== first.route_segment_id,
    )!
    const duplicate: RouteSegment = {
      ...second,
      sequence_no: first.sequence_no,
    }
    const reversed: RouteSegment = {
      ...second,
      sequence_no: first.sequence_no + 1,
      time_start: '1934-09-01',
      time_end: '1934-09-01',
      time_precision: 'T1',
    }

    const duplicatePlan = buildPlaybackPlan(
      events.events,
      routes.routes,
      routes.routeSegments.map((segment) =>
        segment.route_segment_id === second.route_segment_id
          ? duplicate
          : segment,
      ),
      routes.featureCollection,
    )
    const reversedPlan = buildPlaybackPlan(
      events.events,
      routes.routes,
      routes.routeSegments.map((segment) =>
        segment.route_segment_id === second.route_segment_id
          ? reversed
          : segment,
      ),
      routes.featureCollection,
    )

    expect(
      duplicatePlan.errors.some(
        (item) => item.code === 'DUPLICATE_SEQUENCE_NO',
      ),
    ).toBe(true)
    expect(
      reversedPlan.errors.some(
        (item) => item.code === 'DATE_SEQUENCE_CONFLICT',
      ),
    ).toBe(true)
  })

  it('starts from the earliest event, a containing event, or the T6 sequence step', () => {
    const plan = productionPlan()
    expect(findPlaybackStartIndex(plan, '')).toBe(0)
    const containing = findPlaybackStartIndex(plan, '1934-11-03')!
    expect(plan.steps[containing]).toMatchObject({ kind: 'event_anchor' })
    const sequence = findPlaybackStartIndex(plan, '', true)!
    expect(plan.steps[sequence]).toMatchObject({
      kind: 'route_segment',
      timePrecision: 'T6',
    })
    expect(findPlaybackStartIndex({ ...plan, steps: [] }, '')).toBeNull()
  })
})

describe('playback state machine', () => {
  const error: PlaybackIssue = {
    object_type: 'playback',
    object_id: 'test',
    field: 'steps',
    code: 'TEST_ERROR',
    reason: 'test',
  }

  it('starts idle at 1x, pauses idempotently and resumes the same progress', () => {
    const playing = playbackReducer(initialPlaybackState, {
      type: 'start',
      stepIndex: 2,
    })
    const progressed = playbackReducer(playing, {
      type: 'tick',
      amount: 0.4,
      lastStepIndex: 4,
    })
    const paused = playbackReducer(progressed, { type: 'pause' })

    expect(initialPlaybackState).toMatchObject({ status: 'idle', speed: 1 })
    expect(playbackReducer(paused, { type: 'pause' })).toEqual(paused)
    expect(playbackReducer(paused, { type: 'resume' })).toMatchObject({
      status: 'playing',
      stepIndex: 2,
      progress: 0.4,
    })
  })

  it('changes 0.5x/1x/2x without changing step order or progress', () => {
    const playing = {
      ...initialPlaybackState,
      status: 'playing' as const,
      stepIndex: 3,
      progress: 0.45,
    }
    for (const speed of [0.5, 1, 2] as const) {
      expect(
        playbackReducer(playing, { type: 'set_speed', speed }),
      ).toMatchObject({
        speed,
        stepIndex: 3,
        progress: 0.45,
      })
    }
  })

  it('advances deterministically, completes without looping, and clears progress', () => {
    const penultimate = {
      ...initialPlaybackState,
      status: 'playing' as const,
      stepIndex: 1,
      progress: 0.9,
    }
    const last = playbackReducer(penultimate, {
      type: 'tick',
      amount: 0.2,
      lastStepIndex: 2,
    })
    const completed = playbackReducer(last, {
      type: 'tick',
      amount: 1,
      lastStepIndex: 2,
    })

    expect(last).toMatchObject({ status: 'playing', stepIndex: 2, progress: 0 })
    expect(completed).toMatchObject({
      status: 'completed',
      stepIndex: 2,
      progress: 0,
      canResume: false,
    })
  })

  it('interrupts manual date/filter navigation without leaving resumable playback', () => {
    const playing = {
      ...initialPlaybackState,
      status: 'playing' as const,
      stepIndex: 4,
      progress: 0.6,
    }
    expect(playbackReducer(playing, { type: 'interrupt' })).toMatchObject({
      status: 'paused',
      stepIndex: -1,
      progress: 0,
      canResume: false,
    })
  })

  it('enters an object-addressable error state without skipping it', () => {
    expect(
      playbackReducer(initialPlaybackState, { type: 'fail', error }),
    ).toMatchObject({
      status: 'error',
      error,
      canResume: false,
    })
  })
})
