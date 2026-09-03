import type { TimePrecision } from './event'
import type { RouteCertainty } from './route'

export const playbackSpeeds = [0.5, 1, 2] as const
export type PlaybackSpeed = (typeof playbackSpeeds)[number]

export const PLAYBACK_BASE_STEP_MS = 1000
export const PLAYBACK_TICK_MS = 50

export type PlaybackStatus =
  'idle' | 'playing' | 'paused' | 'completed' | 'error'

export interface PlaybackEventStep {
  kind: 'event_anchor'
  stepId: string
  eventId: string
  label: string
  date: string
  timeEnd: string
  timePrecision: TimePrecision
  timeOriginalText: string
}

export interface PlaybackRouteSegmentStep {
  kind: 'route_segment'
  stepId: string
  routeSegmentId: string
  routeId: string
  routeTitle: string
  sequenceNo: number
  label: string
  anchorEventId: string
  anchorDate: string | null
  timePrecision: TimePrecision
  timeOriginalText: string
  routeCertainty: RouteCertainty
  hasGeometry: boolean
  isGap: boolean
}

export type PlaybackStep = PlaybackEventStep | PlaybackRouteSegmentStep

export interface PlaybackIssue {
  object_type: 'playback' | 'event' | 'route' | 'route_segment'
  object_id: string
  field: string
  code: string
  reason: string
}

export interface PlaybackPlan {
  steps: PlaybackStep[]
  excludedRouteSegmentIds: ReadonlySet<string>
  errors: PlaybackIssue[]
}

export interface PlaybackState {
  status: PlaybackStatus
  speed: PlaybackSpeed
  stepIndex: number
  progress: number
  canResume: boolean
  error: PlaybackIssue | null
}

export type PlaybackAction =
  | { type: 'start'; stepIndex: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'interrupt' }
  | { type: 'set_speed'; speed: PlaybackSpeed }
  | { type: 'tick'; amount: number; lastStepIndex: number }
  | { type: 'skip'; lastStepIndex: number }
  | { type: 'fail'; error: PlaybackIssue }

export interface RoutePlaybackVisualState {
  routeSegmentId: string | null
  progress: number
}
