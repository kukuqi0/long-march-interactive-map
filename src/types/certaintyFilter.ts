import type { ClaimConfidence, DisputeStatus } from './history'
import type { RouteCertainty } from './route'

export type RouteVariantView = 'A' | 'B' | 'both'

export interface CertaintyFilterState {
  selectedRouteCertainties: readonly RouteCertainty[]
  showDisputedAlternatives: boolean
  routeVariantView: RouteVariantView
}

export interface DisputePresentation {
  code: DisputeStatus
  label: string
  description: string
  adopted: boolean
  equalAlternatives: boolean
  archived: boolean
}

export interface ClaimConfidencePresentation {
  code: ClaimConfidence
  label: string
  description: string
}
