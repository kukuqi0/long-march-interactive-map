import type { HistoricalEvent } from '../types/event'
import type {
  AggregateMemberMapping,
  Claim,
  LoadedHistoryDataset,
  OrganizationMatchSource,
  OrganizationRelation,
} from '../types/history'
import type {
  LoadedOrganizationDataset,
  Organization,
} from '../types/organization'
import {
  MAX_SELECTED_ORGANIZATIONS,
  type OrganizationFilterResult,
  type OrganizationRelationView,
  type OrganizationSelectionUpdate,
  type OrganizationTreeNode,
} from '../types/organizationFilter'
import type { Route, RouteSegment } from '../types/route'
import {
  isActiveInHalfOpenInterval,
  resolveOrganizationName,
} from '../data/loaders/loadHistory'

function preferredMatch(
  current: OrganizationMatchSource | undefined,
  candidate: OrganizationMatchSource,
) {
  return current === 'direct' || candidate === 'direct' ? 'direct' : candidate
}

function resolveMatch(
  objectOrganizationId: string,
  selectedIds: readonly string[],
  history: LoadedHistoryDataset,
): OrganizationMatchSource | null {
  let match: OrganizationMatchSource | undefined
  for (const selectedId of selectedIds) {
    for (const source of history.aggregateIndex.matchSources(
      selectedId,
      objectOrganizationId,
    )) {
      match = preferredMatch(match, source)
    }
  }
  return match ?? null
}

function eventParticipantIds(event: HistoricalEvent, claims: readonly Claim[]) {
  return claims
    .filter(
      (claim) =>
        claim.subject_type === 'event' &&
        claim.subject_id === event.event_id &&
        claim.predicate === 'had_participant' &&
        claim.object_type === 'entity' &&
        claim.object_value !== null,
    )
    .map((claim) => claim.object_value!)
}

function eventMatch(
  event: HistoricalEvent,
  selectedIds: readonly string[],
  history: LoadedHistoryDataset,
) {
  let match: OrganizationMatchSource | undefined
  for (const organizationId of eventParticipantIds(event, history.claims)) {
    const candidate = resolveMatch(organizationId, selectedIds, history)
    if (candidate) match = preferredMatch(match, candidate)
  }
  return match ?? null
}

export function buildOrganizationFilterResult(
  selectedIds: readonly string[],
  events: readonly HistoricalEvent[],
  routes: readonly Route[],
  routeSegments: readonly RouteSegment[],
  history: LoadedHistoryDataset,
): OrganizationFilterResult {
  if (selectedIds.length === 0) {
    return {
      active: false,
      eventIds: new Set(events.map((event) => event.event_id)),
      routeIds: new Set(routes.map((route) => route.route_id)),
      routeSegmentIds: new Set(
        routeSegments.map((segment) => segment.route_segment_id),
      ),
      eventMatches: new Map(),
      routeMatches: new Map(),
      routeSegmentMatches: new Map(),
    }
  }

  const eventMatches = new Map<string, OrganizationMatchSource>()
  const routeMatches = new Map<string, OrganizationMatchSource>()
  const routeSegmentMatches = new Map<string, OrganizationMatchSource>()
  for (const event of events) {
    const match = eventMatch(event, selectedIds, history)
    if (match) eventMatches.set(event.event_id, match)
  }
  for (const route of routes) {
    const match = resolveMatch(route.organization_id, selectedIds, history)
    if (match) routeMatches.set(route.route_id, match)
  }
  for (const segment of routeSegments) {
    const match = resolveMatch(segment.organization_id, selectedIds, history)
    if (match) routeSegmentMatches.set(segment.route_segment_id, match)
  }
  return {
    active: true,
    eventIds: new Set(eventMatches.keys()),
    routeIds: new Set(routeMatches.keys()),
    routeSegmentIds: new Set(routeSegmentMatches.keys()),
    eventMatches,
    routeMatches,
    routeSegmentMatches,
  }
}

export function combineOrganizationAndTimeVisibility(
  timeIds: ReadonlySet<string>,
  organizationIds: ReadonlySet<string>,
) {
  return new Set([...timeIds].filter((id) => organizationIds.has(id)))
}

export function updateOrganizationSelection(
  selectedIds: readonly string[],
  organizationId: string,
  checked: boolean,
  limit = MAX_SELECTED_ORGANIZATIONS,
): OrganizationSelectionUpdate {
  const current = [...new Set(selectedIds)]
  if (!checked) {
    return {
      selectedIds: current.filter((id) => id !== organizationId),
      rejected: false,
      reason: null,
    }
  }
  if (current.includes(organizationId))
    return { selectedIds: current, rejected: false, reason: null }
  if (current.length >= limit) {
    return {
      selectedIds: current,
      rejected: true,
      reason: `最多选择${limit}个组织。`,
    }
  }
  return {
    selectedIds: [...current, organizationId],
    rejected: false,
    reason: null,
  }
}

function treeNode(
  organization: Readonly<Organization>,
  organizations: LoadedOrganizationDataset,
  history: LoadedHistoryDataset,
  referenceDate: string,
  childIds: readonly string[],
): OrganizationTreeNode {
  const resolution = referenceDate
    ? resolveOrganizationName(
        organization,
        referenceDate,
        history.organizationRelations,
        history.claims,
      )
    : null
  return {
    organizationId: organization.organization_id,
    baseName: organization.name,
    displayName: resolution?.ok ? resolution.displayName : organization.name,
    aggregate: organization.echelon === 'aggregate',
    activeAtReferenceDate:
      referenceDate === ''
        ? null
        : isActiveInHalfOpenInterval(
            organization.valid_from,
            organization.valid_to,
            referenceDate,
          ),
    children: childIds
      .map((id) => organizations.registry.findById(id))
      .filter((item): item is Readonly<Organization> => Boolean(item))
      .map((item) => treeNode(item, organizations, history, referenceDate, [])),
  }
}

export function buildOrganizationTree(
  organizations: LoadedOrganizationDataset,
  history: LoadedHistoryDataset,
  referenceDate: string,
) {
  const memberIds = new Set(
    history.aggregateMembers.map((mapping) => mapping.member_id),
  )
  return organizations.organizations
    .filter((organization) => !memberIds.has(organization.organization_id))
    .map((organization) =>
      treeNode(
        organization,
        organizations,
        history,
        referenceDate,
        history.aggregateIndex.membersOf(organization.organization_id),
      ),
    )
}

const relationLabels: Record<string, string> = {
  subordinate_to: '隶属',
  commands: '指挥',
  renamed_to: '改称',
  merged_into: '并入',
  split_from: '分出自',
  reorganized_into: '改编为',
  allied_with: '协同',
}

export function resolveOrganizationRelations(
  organizationId: string,
  relations: readonly Readonly<OrganizationRelation>[],
  claims: readonly Readonly<Claim>[],
  organizations: LoadedOrganizationDataset,
): readonly OrganizationRelationView[] {
  return relations
    .filter(
      (relation) =>
        relation.subject_organization_id === organizationId ||
        relation.object_organization_id === organizationId,
    )
    .map((relation) => {
      const subject = organizations.registry.findById(
        relation.subject_organization_id,
      )
      const object = organizations.registry.findById(
        relation.object_organization_id,
      )
      const literal = claims.find(
        (claim) =>
          claim.claim_id === relation.claim_id &&
          claim.object_type === 'literal',
      )?.object_value
      return {
        relationId: relation.relation_id,
        relationType: relation.relation_type,
        label: relationLabels[relation.relation_type] ?? relation.relation_type,
        validFrom: relation.valid_from,
        validTo: relation.valid_to,
        subjectName: subject?.name ?? relation.subject_organization_id,
        objectName:
          relation.relation_type === 'renamed_to' && literal
            ? literal
            : (object?.name ?? relation.object_organization_id),
      }
    })
}

export function aggregateMappingsAreNonRecursive(
  mappings: readonly Readonly<AggregateMemberMapping>[],
) {
  const graph = new Map<string, string[]>()
  for (const mapping of mappings) {
    const members = graph.get(mapping.aggregate_id) ?? []
    members.push(mapping.member_id)
    graph.set(mapping.aggregate_id, members)
  }
  const visit = (id: string, path: Set<string>): boolean => {
    if (path.has(id)) return false
    const next = new Set(path).add(id)
    return (graph.get(id) ?? []).every((member) => visit(member, next))
  }
  return [...graph.keys()].every((id) => visit(id, new Set()))
}
