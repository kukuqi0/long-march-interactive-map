import type { LoadedEventDataset } from './event'
import type { LoadedHistoryDataset } from './history'
import type { LoadedOrganizationDataset } from './organization'
import type { LoadedPlaceDataset, PlaceDatasetInput } from './place'
import type { LoadedRouteDataset } from './route'
import type { EventDatasetInput } from './event'
import type { HistoryDatasetInput } from './history'
import type { OrganizationDatasetInput } from './organization'
import type { RouteDatasetInput } from './route'

export type ValidationSeverity = 'error' | 'warning' | 'info'
export type ValidationScope = 'structural' | 'publication'

export interface ValidationIssue {
  code: string
  severity: ValidationSeverity
  scope: ValidationScope
  entity_type: string
  entity_id: string
  field: string
  path: string
  file: string
  message: string
  related_ids?: readonly string[]
  source_code?: string
}

export interface ValidationSection {
  status: 'pass' | 'fail' | 'ready' | 'blocked'
  issue_count: number
  blocking_error_count: number
  issues: readonly ValidationIssue[]
}

export interface ValidationReport {
  structural: ValidationSection
  publication: ValidationSection
  issues: readonly ValidationIssue[]
}

export interface ProjectValidationInput {
  places: PlaceDatasetInput
  events: EventDatasetInput
  organizations: OrganizationDatasetInput
  routes: RouteDatasetInput
  history: HistoryDatasetInput
}

export interface ValidatedProjectDatasets {
  places: LoadedPlaceDataset
  events: LoadedEventDataset
  organizations: LoadedOrganizationDataset
  routes: LoadedRouteDataset
  history: LoadedHistoryDataset
}

export interface ProjectValidationResult {
  datasets: ValidatedProjectDatasets
  report: ValidationReport
}

export interface ClaimPublicationStatus {
  meetsMinimum: boolean
  code:
    | 'complete'
    | 'claim_not_published'
    | 'dataset_not_publishable'
    | 'dataset_tier_blocked'
    | 'missing_supports'
    | 'broken_evidence_fk'
    | 'missing_locator'
    | 'qx_only_support'
  label: string
}
