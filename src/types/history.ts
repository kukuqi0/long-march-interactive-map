import type { TimePrecision } from './event'
import type {
  CommonDataFields,
  LoadedPlaceDataset,
  SpatialPrecision,
} from './place'
import type { LoadedEventDataset } from './event'
import type { LoadedOrganizationDataset, Organization } from './organization'
import type { LoadedRouteDataset } from './route'

export const organizationRelationTypes = [
  'subordinate_to',
  'commands',
  'split_from',
  'merged_into',
  'reorganized_into',
  'renamed_to',
  'allied_with',
] as const

export const claimSubjectTypes = [
  'topic',
  'organization',
  'person',
  'place',
  'event',
  'route_segment',
  'relation',
] as const

export const claimObjectTypes = [
  'entity',
  'literal',
  'date_range',
  'geometry',
  'unknown',
] as const

export const claimDataStates = [
  'asserted',
  'inferred',
  'disputed',
  'unknown',
] as const

export const claimConfidences = ['C-A', 'C-B', 'C-C', 'C-D', 'C-U'] as const
export const claimPredicates = [
  'renamed_to',
  'had_participant',
  'had_name',
  'route_geometry_variant',
] as const
export const disputeTypes = [
  'date',
  'place',
  'route',
  'participant',
  'organization',
  'interpretation',
] as const
export const disputeStatuses = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5'] as const
export const sourceTypes = [
  'ST1',
  'ST2',
  'ST3',
  'ST4',
  'ST5',
  'ST6',
  'ST7',
  'ST8',
  'ST9',
  'ST10',
] as const
export const sourceQualities = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'QX'] as const
export const evidenceRelations = [
  'supports',
  'contradicts',
  'background',
] as const
export const aggregateMappingTypes = [
  'product_editorial_aggregate_member',
] as const
export const organizationMatchSources = ['direct', 'aggregate_member'] as const

export type OrganizationRelationType =
  (typeof organizationRelationTypes)[number]
export type ClaimSubjectType = (typeof claimSubjectTypes)[number]
export type ClaimObjectType = (typeof claimObjectTypes)[number]
export type ClaimDataState = (typeof claimDataStates)[number]
export type ClaimConfidence = (typeof claimConfidences)[number]
export type ClaimPredicate = (typeof claimPredicates)[number]
export type DisputeType = (typeof disputeTypes)[number]
export type DisputeStatus = (typeof disputeStatuses)[number]
export type SourceType = (typeof sourceTypes)[number]
export type SourceQuality = (typeof sourceQualities)[number]
export type EvidenceRelation = (typeof evidenceRelations)[number]
export type AggregateMappingType = (typeof aggregateMappingTypes)[number]
export type OrganizationMatchSource = (typeof organizationMatchSources)[number]

export interface OrganizationRelation extends CommonDataFields {
  relation_id: string
  subject_organization_id: string
  relation_type: OrganizationRelationType
  object_organization_id: string
  valid_from: string | null
  valid_to: string | null
  time_precision: TimePrecision
  claim_id: string
  review_status: 'draft'
}

export interface Claim extends CommonDataFields {
  claim_id: string
  subject_type: ClaimSubjectType
  subject_id: string
  predicate: ClaimPredicate
  object_type: ClaimObjectType
  object_value: string | null
  claim_data_state: ClaimDataState
  time_precision: TimePrecision | null
  spatial_precision: SpatialPrecision | null
  claim_confidence: ClaimConfidence
  review_status: 'draft'
}

export interface Source extends CommonDataFields {
  source_id: string
  source_type: SourceType
  title: string
  creator: string | null
  edition: string | null
  publication_year: number | null
  publisher_or_archive: string | null
  source_quality: SourceQuality
  public_url?: string | null
  file_location?: string | null
  review_status: 'draft'
}

export interface EvidenceLink extends CommonDataFields {
  evidence_link_id: string
  claim_id: string
  source_id: string
  evidence_relation: EvidenceRelation
  locator: string | null
  excerpt: string | null
  interpretation_note: string | null
  review_status: 'draft'
}

export interface Dispute extends CommonDataFields {
  dispute_id: string
  title: string
  dispute_type: DisputeType
  dispute_status: DisputeStatus
  competing_claim_ids: readonly string[]
  adopted_claim_id: string | null
  editorial_note: string
  review_status: 'draft'
}

export interface AggregateMemberMapping {
  aggregate_id: string
  member_id: string
  mapping_type: AggregateMappingType
}

export interface HistoryDatasetManifest {
  dataset_tier: 'sample-draft'
  is_sample: true
  publication_allowed: false
  review_status: 'draft'
  data_version: string
  content_note: string
}

export interface HistoryDataIssue {
  file: string
  record_id: string
  field: string
  error_code: string
  message: string
}

export interface HistoryDatasetInput {
  manifest: unknown
  organizationRelations: unknown
  claims: unknown
  sources: unknown
  evidenceLinks: unknown
  disputes: unknown
  aggregateMembers: unknown
  datasetPath?: string
}

export interface HistoryDependencies {
  places: LoadedPlaceDataset
  events: LoadedEventDataset
  organizations: LoadedOrganizationDataset
  routes: LoadedRouteDataset
}

export interface ReadonlyAggregateMembershipIndex {
  readonly size: number
  membersOf(aggregateId: string): readonly string[]
  matchSources(
    selectedOrganizationId: string,
    objectOrganizationId: string,
  ): readonly OrganizationMatchSource[]
}

export interface LoadedHistoryDataset {
  ok: boolean
  manifest: HistoryDatasetManifest | null
  organizationRelations: readonly Readonly<OrganizationRelation>[]
  claims: readonly Readonly<Claim>[]
  sources: readonly Readonly<Source>[]
  evidenceLinks: readonly Readonly<EvidenceLink>[]
  disputes: readonly Readonly<Dispute>[]
  aggregateMembers: readonly Readonly<AggregateMemberMapping>[]
  aggregateIndex: ReadonlyAggregateMembershipIndex
  errors: readonly HistoryDataIssue[]
}

export type OrganizationNameResolution =
  | {
      ok: true
      organization: Readonly<Organization>
      displayName: string
      source: 'organization.name' | 'renamed_to_claim_literal'
    }
  | {
      ok: false
      reason: 'invalid_date' | 'organization_inactive' | 'claim_unavailable'
    }
