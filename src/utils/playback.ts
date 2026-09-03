import type { HistoricalEvent } from '../types/event'
import type {
  PlaybackAction,
  PlaybackEventStep,
  PlaybackIssue,
  PlaybackPlan,
  PlaybackRouteSegmentStep,
  PlaybackState,
} from '../types/playback'
import type { RenderRouteCollection, Route, RouteSegment } from '../types/route'
import { classifyTemporalObject, isIsoCalendarDate } from './timeFilter'

export const initialPlaybackState: PlaybackState = {
  status: 'idle',
  speed: 1,
  stepIndex: -1,
  progress: 0,
  canResume: false,
  error: null,
}

function advanceState(state: PlaybackState, lastStepIndex: number) {
  if (state.stepIndex >= lastStepIndex) {
    return {
      ...state,
      status: 'completed' as const,
      progress: 0,
      canResume: false,
    }
  }
  return { ...state, stepIndex: state.stepIndex + 1, progress: 0 }
}

export function playbackReducer(
  state: PlaybackState,
  action: PlaybackAction,
): PlaybackState {
  switch (action.type) {
    case 'start':
      return {
        ...state,
        status: 'playing',
        stepIndex: action.stepIndex,
        progress: 0,
        canResume: false,
        error: null,
      }
    case 'pause':
      return state.status === 'playing'
        ? { ...state, status: 'paused', canResume: true }
        : state
    case 'resume':
      return state.status === 'paused' && state.canResume
        ? { ...state, status: 'playing', canResume: false }
        : state
    case 'interrupt':
      if (state.status === 'idle') return state
      if (state.status === 'completed' || state.status === 'error') {
        return { ...initialPlaybackState, speed: state.speed }
      }
      return {
        ...state,
        status: 'paused',
        stepIndex: -1,
        progress: 0,
        canResume: false,
      }
    case 'set_speed':
      return { ...state, speed: action.speed }
    case 'tick': {
      if (state.status !== 'playing') return state
      const progress = state.progress + action.amount
      return progress >= 1
        ? advanceState(state, action.lastStepIndex)
        : { ...state, progress }
    }
    case 'skip':
      return state.status === 'playing'
        ? advanceState(state, action.lastStepIndex)
        : state
    case 'fail':
      return {
        ...state,
        status: 'error',
        progress: 0,
        canResume: false,
        error: action.error,
      }
  }
}

function issue(
  objectType: PlaybackIssue['object_type'],
  objectId: string,
  field: string,
  code: string,
  reason: string,
): PlaybackIssue {
  return {
    object_type: objectType,
    object_id: objectId,
    field,
    code,
    reason,
  }
}

function eventAnchors(
  events: readonly HistoricalEvent[],
  errors: PlaybackIssue[],
) {
  return events
    .map((event, originalIndex) => {
      const date = event.time_start ?? event.time_end
      const classification = classifyTemporalObject(
        {
          objectType: 'event',
          objectId: event.event_id,
          timeStart: event.time_start,
          timeEnd: event.time_end,
          timePrecision: event.time_precision,
          timeOriginalText: event.time_original_text,
        },
        date ?? '1934-10-01',
      )
      if (!classification.ok) {
        errors.push({
          ...classification.error,
          object_type: 'event',
        })
        return null
      }
      if (event.time_precision === 'T6' || event.time_precision === 'TU') {
        return null
      }
      if (!date || !isIsoCalendarDate(date)) {
        errors.push(
          issue(
            'event',
            event.event_id,
            'time_start,time_end',
            'INVALID_EVENT_ANCHOR',
            'event无法形成合法日期播放锚点。',
          ),
        )
        return null
      }
      return {
        event,
        originalIndex,
        date,
        timeEnd: event.time_end ?? date,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.originalIndex - right.originalIndex,
    )
}

function segmentAnchorDate(segment: RouteSegment) {
  return segment.time_start ?? segment.time_end
}

export function buildPlaybackPlan(
  events: readonly HistoricalEvent[],
  routes: readonly Route[],
  segments: readonly RouteSegment[],
  featureCollection: RenderRouteCollection,
): PlaybackPlan {
  const errors: PlaybackIssue[] = []
  const excludedRouteSegmentIds = new Set<string>()
  const anchors = eventAnchors(events, errors)
  const routeById = new Map(routes.map((route) => [route.route_id, route]))
  const routeOrder = new Map(
    routes.map((route, index) => [route.route_id, index]),
  )
  const featuresBySegment = new Map<string, typeof featureCollection.features>()
  for (const feature of featureCollection.features) {
    const id = feature.properties.route_segment_id
    const current = featuresBySegment.get(id) ?? []
    current.push(feature)
    featuresBySegment.set(id, current)
  }

  const grouped = new Map<string, RouteSegment[]>()
  for (const segment of segments) {
    if (!routeById.has(segment.route_id)) {
      errors.push(
        issue(
          'route_segment',
          segment.route_segment_id,
          'route_id',
          'ROUTE_NOT_FOUND',
          'route_segment引用的route不存在。',
        ),
      )
      continue
    }
    const group = grouped.get(segment.route_id) ?? []
    group.push(segment)
    grouped.set(segment.route_id, group)
  }

  const segmentBuckets = new Map<string, PlaybackRouteSegmentStep[]>()
  const sequenceSteps: Array<{
    segment: RouteSegment
    route: Route
    anchorEventId: string
  }> = []

  for (const route of routes) {
    const group = [...(grouped.get(route.route_id) ?? [])].sort(
      (left, right) => left.sequence_no - right.sequence_no,
    )
    const seenSequences = new Set<number>()
    let previousDated: { id: string; date: string } | null = null

    for (const segment of group) {
      if (seenSequences.has(segment.sequence_no)) {
        errors.push(
          issue(
            'route_segment',
            segment.route_segment_id,
            'sequence_no',
            'DUPLICATE_SEQUENCE_NO',
            '同一route内sequence_no重复，播放已停止。',
          ),
        )
      }
      seenSequences.add(segment.sequence_no)

      const date = segmentAnchorDate(segment)
      if (date && isIsoCalendarDate(date)) {
        if (previousDated && date < previousDated.date) {
          errors.push(
            issue(
              'route_segment',
              segment.route_segment_id,
              'sequence_no,time_start',
              'DATE_SEQUENCE_CONFLICT',
              `日期顺序早于前序路段${previousDated.id}，不得自行选择排序真相。`,
            ),
          )
        }
        previousDated = { id: segment.route_segment_id, date }
      }
    }

    for (let index = 0; index < group.length; index += 1) {
      const segment = group[index]
      const knownBoundary = segmentAnchorDate(segment)
      const classification = classifyTemporalObject(
        {
          objectType: 'route_segment',
          objectId: segment.route_segment_id,
          timeStart: segment.time_start,
          timeEnd: segment.time_end,
          timePrecision: segment.time_precision,
          timeOriginalText: segment.time_original_text,
        },
        knownBoundary ?? '1934-10-01',
      )
      if (!classification.ok) {
        errors.push({
          ...classification.error,
          object_type: 'route_segment',
        })
        continue
      }
      if (segment.time_precision === 'TU' || segment.route_certainty === 'RU') {
        excludedRouteSegmentIds.add(segment.route_segment_id)
        continue
      }
      if (segment.time_precision === 'T5') {
        excludedRouteSegmentIds.add(segment.route_segment_id)
        continue
      }

      if (segment.time_precision === 'T6') {
        const nextDated = group.slice(index + 1).find((candidate) => {
          return (
            candidate.time_precision !== 'TU' &&
            candidate.time_precision !== 'T5' &&
            segmentAnchorDate(candidate) !== null
          )
        })
        const previousDatedSegment = [...group]
          .slice(0, index)
          .reverse()
          .find((candidate) => segmentAnchorDate(candidate) !== null)
        const neighboringDate = nextDated
          ? segmentAnchorDate(nextDated)
          : previousDatedSegment
            ? segmentAnchorDate(previousDatedSegment)
            : null
        const anchor = neighboringDate
          ? anchors.find((candidate) => candidate.date >= neighboringDate)
          : null
        if (!anchor) {
          errors.push(
            issue(
              'route_segment',
              segment.route_segment_id,
              'sequence_no',
              'T6_ANCHOR_UNAVAILABLE',
              'T6路段无法在不伪造日期的情况下插入既有路线顺序。',
            ),
          )
          continue
        }
        sequenceSteps.push({
          segment,
          route,
          anchorEventId: anchor.event.event_id,
        })
        continue
      }

      const date = segmentAnchorDate(segment)
      if (!date || !isIsoCalendarDate(date)) {
        errors.push(
          issue(
            'route_segment',
            segment.route_segment_id,
            'time_start,time_end',
            'INVALID_SEGMENT_ANCHOR',
            '路段无法形成合法时间同步边界。',
          ),
        )
        continue
      }
      const anchor = anchors.find((candidate) => candidate.date >= date)
      if (!anchor) {
        errors.push(
          issue(
            'route_segment',
            segment.route_segment_id,
            'time_start,time_end',
            'EVENT_ANCHOR_NOT_FOUND',
            '没有不早于路段边界的合法event播放锚点。',
          ),
        )
        continue
      }
      const features = featuresBySegment.get(segment.route_segment_id) ?? []
      if (
        segment.route_certainty === 'R4' &&
        new Set(features.map((feature) => feature.properties.alternative_id))
          .size < 2
      ) {
        errors.push(
          issue(
            'route_segment',
            segment.route_segment_id,
            'geometry_ref',
            'R4_ALTERNATIVES_NOT_SEPARATED',
            'R4必须至少保留两个分离替代方案才能播放。',
          ),
        )
        continue
      }
      if (
        !['R5', 'RU'].includes(segment.route_certainty) &&
        features.length === 0
      ) {
        errors.push(
          issue(
            'route_segment',
            segment.route_segment_id,
            'geometry_ref',
            'PLAYBACK_GEOMETRY_NOT_FOUND',
            '可地图化播放路段没有现有合法几何。',
          ),
        )
        continue
      }
      const bucket = segmentBuckets.get(anchor.event.event_id) ?? []
      bucket.push({
        kind: 'route_segment',
        stepId: `segment:${segment.route_segment_id}`,
        routeSegmentId: segment.route_segment_id,
        routeId: route.route_id,
        routeTitle: route.title,
        sequenceNo: segment.sequence_no,
        label: `${route.title} · 路段${segment.sequence_no}`,
        anchorEventId: anchor.event.event_id,
        anchorDate: date,
        timePrecision: segment.time_precision,
        timeOriginalText: segment.time_original_text,
        routeCertainty: segment.route_certainty,
        hasGeometry: features.length > 0,
        isGap: segment.route_certainty === 'R5',
      })
      segmentBuckets.set(anchor.event.event_id, bucket)
    }
  }

  for (const entry of sequenceSteps) {
    const segment = entry.segment
    const bucket = segmentBuckets.get(entry.anchorEventId) ?? []
    bucket.push({
      kind: 'route_segment',
      stepId: `segment:${segment.route_segment_id}`,
      routeSegmentId: segment.route_segment_id,
      routeId: entry.route.route_id,
      routeTitle: entry.route.title,
      sequenceNo: segment.sequence_no,
      label: `${entry.route.title} · 路段${segment.sequence_no}`,
      anchorEventId: entry.anchorEventId,
      anchorDate: null,
      timePrecision: 'T6',
      timeOriginalText: segment.time_original_text,
      routeCertainty: segment.route_certainty,
      hasGeometry: false,
      isGap: segment.route_certainty === 'R5',
    })
    segmentBuckets.set(entry.anchorEventId, bucket)
  }

  const steps = anchors.flatMap<PlaybackEventStep | PlaybackRouteSegmentStep>(
    (anchor) => {
      const eventStep: PlaybackEventStep = {
        kind: 'event_anchor',
        stepId: `event:${anchor.event.event_id}`,
        eventId: anchor.event.event_id,
        label: anchor.event.title,
        date: anchor.date,
        timeEnd: anchor.timeEnd,
        timePrecision: anchor.event.time_precision,
        timeOriginalText: anchor.event.time_original_text,
      }
      const bucket = segmentBuckets.get(anchor.event.event_id) ?? []
      bucket.sort(
        (left, right) =>
          (routeOrder.get(left.routeId) ?? Number.MAX_SAFE_INTEGER) -
            (routeOrder.get(right.routeId) ?? Number.MAX_SAFE_INTEGER) ||
          left.sequenceNo - right.sequenceNo,
      )
      return [eventStep, ...bucket]
    },
  )

  return { steps, excludedRouteSegmentIds, errors }
}

export function findPlaybackStartIndex(
  plan: PlaybackPlan,
  referenceDate: string,
  sequenceOnly = false,
) {
  if (sequenceOnly) {
    const index = plan.steps.findIndex(
      (step) => step.kind === 'route_segment' && step.timePrecision === 'T6',
    )
    return index >= 0 ? index : null
  }
  const index = plan.steps.findIndex((step) => {
    if (step.kind !== 'event_anchor') return false
    if (!referenceDate) return true
    return (
      (step.date <= referenceDate && referenceDate <= step.timeEnd) ||
      step.date > referenceDate
    )
  })
  return index >= 0 ? index : null
}
