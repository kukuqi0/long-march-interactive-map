import type { CommonDataFields, PointGeometry, SpatialPrecision } from './place'

export const eventTypes = [
  'battle',
  'meeting',
  'movement',
  'river_crossing',
  'mountain_crossing',
  'rendezvous',
  'stay',
  'reorganization',
  'other',
] as const

export const timePrecisions = [
  'T0',
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
  'TU',
] as const

export type EventType = (typeof eventTypes)[number]
export type TimePrecision = (typeof timePrecisions)[number]

export const eventTypePresentation: Record<
  EventType,
  { label: string; iconId: string; shape: string }
> = {
  battle: { label: '战役类', iconId: 't05-event-battle', shape: 'star-cross' },
  meeting: {
    label: '会议类',
    iconId: 't05-event-meeting',
    shape: 'lined-square',
  },
  movement: {
    label: '行动类',
    iconId: 't05-event-movement',
    shape: 'arrow-triangle',
  },
  river_crossing: {
    label: '渡河类',
    iconId: 't05-event-river-crossing',
    shape: 'wave-diamond',
  },
  mountain_crossing: {
    label: '翻山类',
    iconId: 't05-event-mountain-crossing',
    shape: 'twin-peaks',
  },
  rendezvous: {
    label: '会师类',
    iconId: 't05-event-rendezvous',
    shape: 'joined-circles',
  },
  stay: { label: '驻留类', iconId: 't05-event-stay', shape: 'ring-square' },
  reorganization: {
    label: '改编类',
    iconId: 't05-event-reorganization',
    shape: 'lined-hexagon',
  },
  other: { label: '其他类', iconId: 't05-event-other', shape: 'plus-diamond' },
}

export interface HistoricalEvent extends CommonDataFields {
  event_id: string
  topic_id: string
  title: string
  event_type: EventType
  time_original_text: string
  time_start: string | null
  time_end: string | null
  time_precision: TimePrecision
  place_id: string | null
  spatial_precision: SpatialPrecision
  summary: string | null
  review_status: 'draft'
}

export interface EventDatasetManifest {
  dataset_tier: 'sample-draft'
  is_sample: true
  publication_allowed: false
  review_status: 'draft'
  data_version: string
  content_note: string
}

export interface RenderEventProperties {
  event_id: string
  title: string
  event_type: EventType
  event_type_label: string
  icon_id: string
  selected_icon_id: string
  time_original_text: string
  time_precision: TimePrecision
  spatial_precision: SpatialPrecision
  place_id: string
  sample_notice: string
}

export interface RenderEventFeature {
  type: 'Feature'
  id: string
  properties: RenderEventProperties
  geometry: PointGeometry
}

export interface RenderEventCollection {
  type: 'FeatureCollection'
  features: RenderEventFeature[]
}

export interface EventDataIssue {
  file: string
  record_id: string
  field: string
  error_code: string
  message: string
}

export interface UnmappedEvent {
  event_id: string
  reason: string
}

export interface LoadedEventDataset {
  ok: boolean
  manifest: EventDatasetManifest | null
  events: HistoricalEvent[]
  featureCollection: RenderEventCollection
  unmapped: UnmappedEvent[]
  errors: EventDataIssue[]
}

export interface EventDatasetInput {
  manifest: unknown
  events: unknown
  datasetPath?: string
}
