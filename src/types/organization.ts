import type { CommonDataFields } from './place'

export const organizationTypes = [
  'political',
  'military',
  'temporary_detachment',
] as const

export const organizationEchelons = [
  'aggregate',
  'army_group',
  'corps',
  'division',
  'regiment',
  'column',
  'detachment',
  'unknown',
] as const

export const organizationTimePrecisions = [
  'T0',
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
  'TU',
] as const

export type OrganizationType = (typeof organizationTypes)[number]
export type OrganizationEchelon = (typeof organizationEchelons)[number]
export type OrganizationTimePrecision =
  (typeof organizationTimePrecisions)[number]

export interface Organization extends CommonDataFields {
  organization_id: string
  name: string
  organization_type: OrganizationType
  echelon: OrganizationEchelon | null
  valid_from: string | null
  valid_to: string | null
  time_precision: OrganizationTimePrecision
  description?: string | null
  review_status: 'draft'
}

export interface OrganizationDatasetManifest {
  dataset_tier: 'sample-draft'
  is_sample: true
  publication_allowed: false
  review_status: 'draft'
  data_version: string
  content_note: string
}

export interface OrganizationDataIssue {
  file: string
  record_id: string
  field: string
  error_code: string
  message: string
}

export interface OrganizationForeignKeyContext {
  file: string
  recordId: string
  field?: string
}

export type OrganizationForeignKeyResult =
  | { ok: true; organization: Readonly<Organization> }
  | { ok: false; error: OrganizationDataIssue }

export interface ReadonlyOrganizationRegistry {
  readonly size: number
  findById(organizationId: string): Readonly<Organization> | undefined
  require(
    organizationId: string,
    context: OrganizationForeignKeyContext,
  ): OrganizationForeignKeyResult
}

export interface OrganizationDatasetInput {
  manifest: unknown
  organizations: unknown
  datasetPath?: string
}

export interface LoadedOrganizationDataset {
  ok: boolean
  manifest: OrganizationDatasetManifest | null
  organizations: readonly Readonly<Organization>[]
  registry: ReadonlyOrganizationRegistry
  errors: OrganizationDataIssue[]
}
