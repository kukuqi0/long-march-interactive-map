import type { CommonDataFields, SpatialPrecision } from './place'
import type { TimePrecision } from './event'

export const routeRoles = ['main', 'branch', 'related'] as const
export const movementTypes = [
  'advance',
  'retreat',
  'transfer',
  'branch',
  'rendezvous',
  'stay',
  'river_crossing',
  'mountain_crossing',
  'unknown',
] as const
export const routeCertainties = ['R1', 'R2', 'R3', 'R4', 'R5', 'RU'] as const
export const geometryMethods = [
  'source_trace',
  'point_sequence',
  'corridor',
  'direction_only',
  'none',
] as const

export type RouteRole = (typeof routeRoles)[number]
export type MovementType = (typeof movementTypes)[number]
export type RouteCertainty = (typeof routeCertainties)[number]
export type GeometryMethod = (typeof geometryMethods)[number]

export interface Route extends CommonDataFields {
  route_id: string
  topic_id: string
  organization_id: string
  title: string
  route_role: RouteRole
  review_status: 'draft'
}

export interface RouteSegment extends CommonDataFields {
  route_segment_id: string
  route_id: string
  sequence_no: number
  organization_id: string
  from_place_id: string | null
  to_place_id: string | null
  time_original_text: string
  time_start: string | null
  time_end: string | null
  time_precision: TimePrecision
  movement_type: MovementType
  route_certainty: RouteCertainty
  spatial_precision: SpatialPrecision
  geometry_ref: string | null
  geometry_method: GeometryMethod
  uncertainty_note: string | null
  review_status: 'draft'
}

export interface RouteDatasetManifest {
  dataset_tier: 'sample-draft'
  is_sample: true
  publication_allowed: false
  review_status: 'draft'
  data_version: string
  content_note: string
}

export interface RouteGeometryProperties {
  geometry_ref: string
  route_segment_id: string
  alternative_id: string | null
  alternative_label: string | null
}

export type RouteGeometry =
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'Polygon'; coordinates: [number, number][][] }

export interface RouteGeometryFeature {
  type: 'Feature'
  id: string
  properties: RouteGeometryProperties
  geometry: RouteGeometry
}

export interface RouteGeometryCollection {
  type: 'FeatureCollection'
  features: RouteGeometryFeature[]
}

export interface RenderRouteProperties extends RouteGeometryProperties {
  route_id: string
  route_title: string
  route_role: RouteRole
  sequence_no: number
  organization_id: string
  route_certainty: RouteCertainty
  spatial_precision: SpatialPrecision
  geometry_method: GeometryMethod
  sample_notice: string
}

export interface RenderRouteFeature {
  type: 'Feature'
  id: string
  properties: RenderRouteProperties
  geometry: RouteGeometry
}

export interface RenderRouteCollection {
  type: 'FeatureCollection'
  features: RenderRouteFeature[]
}

export interface RouteDataIssue {
  file: string
  record_id: string
  field: string
  error_code: string
  message: string
}

export interface UnmappedRouteSegment {
  route_segment_id: string
  reason: string
}

export interface LoadedRouteDataset {
  ok: boolean
  manifest: RouteDatasetManifest | null
  routes: Route[]
  routeSegments: RouteSegment[]
  featureCollection: RenderRouteCollection
  unmapped: UnmappedRouteSegment[]
  errors: RouteDataIssue[]
}

export interface RouteDatasetInput {
  manifest: unknown
  routes: unknown
  routeSegments: unknown
  geometries: unknown
  datasetPath?: string
}

export const routeCertaintyPresentation: Record<
  RouteCertainty,
  { label: string; visual: string }
> = {
  R1: { label: 'R1 可靠路线（样例待核验）', visual: '双边实线' },
  R2: { label: 'R2 点间路径推定', visual: '长虚线' },
  R3: { label: 'R3 仅知大致通道', visual: '半透明宽带与点线边界' },
  R4: { label: 'R4 争议路线（A/B结构测试）', visual: '分离点划线方案' },
  R5: { label: 'R5 中间路线不详', visual: '无连接几何' },
  RU: { label: 'RU 资料不足', visual: '不地图化' },
}
