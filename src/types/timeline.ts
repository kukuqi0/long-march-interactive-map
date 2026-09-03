import type { TimePrecision } from './event'
import type { TemporalObjectType, TimeComparisonIssue } from './timeFilter'

export const TOPIC_START_DATE = '1934-10-01'
export const TOPIC_END_DATE = '1936-10-31'

export type TimelineDatedShape = 'node' | 'interval' | 'open-start' | 'open-end'

export interface TimelineDatedItem {
  objectType: TemporalObjectType
  objectId: string
  label: string
  timeOriginalText: string
  timePrecision: TimePrecision
  timeStart: string | null
  timeEnd: string | null
  shape: TimelineDatedShape
  startPercent: number | null
  endPercent: number | null
}

export interface TimelineSequenceItem {
  objectType: TemporalObjectType
  objectId: string
  label: string
  timeOriginalText: string
  sequenceNo: number | null
}

export interface TimelineUnknownItem {
  objectType: TemporalObjectType
  objectId: string
  label: string
  timeOriginalText: string
}

export interface TimelineView {
  dated: TimelineDatedItem[]
  sequenceOnly: TimelineSequenceItem[]
  unknown: TimelineUnknownItem[]
  errors: TimeComparisonIssue[]
}

export interface TimelineNavigationTarget {
  eventId: string
  label: string
  date: string
  originalIndex: number
}

export interface TimelineNeighbors {
  previous: TimelineNavigationTarget | null
  next: TimelineNavigationTarget | null
}

export interface TimelineDateIssue {
  object_type: 'timeline'
  object_id: 'timeline_cursor'
  field: 'reference_date'
  code: 'EMPTY_DATE' | 'INVALID_DATE' | 'DATE_OUT_OF_RANGE'
  reason: string
}
