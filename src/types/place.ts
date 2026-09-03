export const geometryTypes = [
  'point',
  'line',
  'polygon',
  'corridor',
  'none',
] as const

export const spatialPrecisions = [
  'S0',
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'SU',
] as const

export const matchStatuses = [
  'exact',
  'probable',
  'disputed',
  'unmatched',
] as const

export const reviewStatuses = [
  'draft',
  'sourced',
  'first_review',
  'second_review',
  'published',
  'needs_revision',
  'withheld',
  'withdrawn',
] as const

export const historicalNameTypes = [
  'official',
  'common',
  'alias',
  'transcription',
] as const

export type GeometryType = (typeof geometryTypes)[number]
export type SpatialPrecision = (typeof spatialPrecisions)[number]
export type MatchStatus = (typeof matchStatuses)[number]
export type ReviewStatus = (typeof reviewStatuses)[number]
export type HistoricalNameType = (typeof historicalNameTypes)[number]

export interface CommonDataFields {
  created_at: string
  updated_at: string
  data_version: string
}

export interface Place extends CommonDataFields {
  place_id: string
  modern_reference_name: string | null
  geometry_type: GeometryType
  geometry_ref: string | null
  spatial_precision: SpatialPrecision
  match_status: MatchStatus
  match_note: string | null
  review_status: ReviewStatus
}

export interface HistoricalPlaceName extends CommonDataFields {
  historical_name_id: string
  place_id: string
  name: string
  name_type: HistoricalNameType
  valid_from: string | null
  valid_to: string | null
  claim_id: string
}

export interface PlaceDatasetManifest {
  dataset_tier: 'sample-draft'
  is_sample: true
  publication_allowed: false
  review_status: 'draft'
  data_version: string
  content_note: string
}

export interface PointGeometry {
  type: 'Point'
  coordinates: [number, number]
}

export interface SourceGeometryProperties {
  place_id: string
}

export interface SourceGeometryFeature {
  type: 'Feature'
  id: string
  properties: SourceGeometryProperties
  geometry: PointGeometry
}

export interface SourceGeometryCollection {
  type: 'FeatureCollection'
  features: SourceGeometryFeature[]
}

export interface RenderPlaceProperties {
  place_id: string
  display_name: string
  display_name_kind:
    | 'historical-placeholder'
    | 'historical-name'
    | 'modern-reference'
    | 'stable-id'
  spatial_precision: SpatialPrecision
  is_representative_point: boolean
  sample_notice: string
}

export interface RenderPlaceFeature {
  type: 'Feature'
  id: string
  properties: RenderPlaceProperties
  geometry: PointGeometry
}

export interface RenderPlaceCollection {
  type: 'FeatureCollection'
  features: RenderPlaceFeature[]
}

export interface PlaceDataIssue {
  record_id: string
  file: string
  field: string
  error_code: string
  message: string
}

export interface UnmappedPlace {
  place_id: string
  reason: string
}

export interface LoadedPlaceDataset {
  ok: boolean
  manifest: PlaceDatasetManifest | null
  places: Place[]
  historicalNames: HistoricalPlaceName[]
  featureCollection: RenderPlaceCollection
  unmapped: UnmappedPlace[]
  warnings: PlaceDataIssue[]
  errors: PlaceDataIssue[]
}

export interface PlaceDatasetInput {
  manifest: unknown
  places: unknown
  historicalNames: unknown
  geometries: unknown
  datasetPath?: string
}
