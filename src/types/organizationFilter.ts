import type { OrganizationMatchSource } from './history'

export const MAX_SELECTED_ORGANIZATIONS = 4

export interface OrganizationFilterResult {
  readonly active: boolean
  readonly eventIds: ReadonlySet<string>
  readonly routeIds: ReadonlySet<string>
  readonly routeSegmentIds: ReadonlySet<string>
  readonly eventMatches: ReadonlyMap<string, OrganizationMatchSource>
  readonly routeMatches: ReadonlyMap<string, OrganizationMatchSource>
  readonly routeSegmentMatches: ReadonlyMap<string, OrganizationMatchSource>
}

export interface OrganizationTreeNode {
  readonly organizationId: string
  readonly baseName: string
  readonly displayName: string
  readonly aggregate: boolean
  readonly activeAtReferenceDate: boolean | null
  readonly children: readonly OrganizationTreeNode[]
}

export interface OrganizationRelationView {
  readonly relationId: string
  readonly relationType: string
  readonly label: string
  readonly validFrom: string | null
  readonly validTo: string | null
  readonly subjectName: string
  readonly objectName: string
}

export interface OrganizationSelectionUpdate {
  readonly selectedIds: readonly string[]
  readonly rejected: boolean
  readonly reason: string | null
}
