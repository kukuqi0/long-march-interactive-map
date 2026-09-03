import type { TimePrecision } from './event'

export const timeFilterStatuses = [
  'all',
  'completed',
  'current',
  'future',
  'sequence_only',
  'unknown',
] as const

export type TimeFilterStatus = (typeof timeFilterStatuses)[number]
export type TemporalStatus = Exclude<TimeFilterStatus, 'all'>
export type TemporalObjectType = 'event' | 'route_segment'

export interface TemporalObjectInput {
  objectType: TemporalObjectType
  objectId: string
  timeStart: string | null
  timeEnd: string | null
  timePrecision: TimePrecision
  timeOriginalText: string
}

export interface TimeComparisonIssue {
  object_type: TemporalObjectType | 'time_filter'
  object_id: string
  field: string
  code: string
  reason: string
}

export type TemporalClassification =
  | { ok: true; status: TemporalStatus }
  | { ok: false; error: TimeComparisonIssue }

export interface AppliedTimeFilter {
  status: TimeFilterStatus
  referenceDate: string
}

export interface TimeFilterResult {
  eventIds: ReadonlySet<string>
  routeSegmentIds: ReadonlySet<string>
  errors: TimeComparisonIssue[]
}
