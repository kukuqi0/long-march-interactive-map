import { describe, expect, it } from 'vitest'
import { loadT05EventDataset } from '../data/loaders/loadEvents'
import { loadT11PreHistoryDataset } from '../data/loaders/loadHistory'
import { loadT06PreOrganizationDataset } from '../data/loaders/loadOrganizations'
import { loadT04PlaceDataset } from '../data/loaders/loadPlaces'
import { loadT06RouteDataset } from '../data/loaders/loadRoutes'
import type { OrganizationRelation } from '../types/history'
import {
  aggregateMappingsAreNonRecursive,
  buildOrganizationFilterResult,
  buildOrganizationTree,
  combineOrganizationAndTimeVisibility,
  resolveOrganizationRelations,
  updateOrganizationSelection,
} from './organizationFilter'

const places = loadT04PlaceDataset()
const events = loadT05EventDataset(places)
const organizations = loadT06PreOrganizationDataset()
const routes = loadT06RouteDataset(places, organizations)
const history = loadT11PreHistoryDataset({
  places,
  events,
  organizations,
  routes,
})

function result(selectedIds: readonly string[]) {
  return buildOrganizationFilterResult(
    selectedIds,
    events.events,
    routes.routes,
    routes.routeSegments,
    history,
  )
}

describe('shared organization filtering', () => {
  it('treats zero selections as all without adding match claims', () => {
    const filtered = result([])
    expect(filtered.active).toBe(false)
    expect(filtered.eventIds.size).toBe(10)
    expect(filtered.routeIds.size).toBe(2)
    expect(filtered.routeSegmentIds.size).toBe(8)
    expect(filtered.eventMatches.size).toBe(0)
  })

  it('matches aggregate direct routes and its explicit member event only', () => {
    const filtered = result(['org_central_red_army'])
    expect(filtered.eventIds).toEqual(
      new Set(['event_liping_capture_1934_12_15']),
    )
    expect(filtered.eventMatches.get('event_liping_capture_1934_12_15')).toBe(
      'aggregate_member',
    )
    expect(filtered.routeIds.size).toBe(2)
    expect(filtered.routeSegmentIds.size).toBe(8)
    expect([...filtered.routeMatches.values()]).toEqual(['direct', 'direct'])
    expect(
      [...filtered.routeSegmentMatches.values()].every(
        (match) => match === 'direct',
      ),
    ).toBe(true)
  })

  it('matches the first corps event directly without inheriting aggregate routes', () => {
    const filtered = result(['org_red_first_corps'])
    expect(filtered.eventIds).toEqual(
      new Set(['event_liping_capture_1934_12_15']),
    )
    expect(filtered.eventMatches.get('event_liping_capture_1934_12_15')).toBe(
      'direct',
    )
    expect(filtered.routeIds.size).toBe(0)
    expect(filtered.routeSegmentIds.size).toBe(0)
  })

  it('unions selections, deduplicates events and prefers direct match', () => {
    const filtered = result(['org_central_red_army', 'org_red_first_corps'])
    expect([...filtered.eventIds]).toEqual(['event_liping_capture_1934_12_15'])
    expect(filtered.eventMatches.get('event_liping_capture_1934_12_15')).toBe(
      'direct',
    )
    expect(filtered.routeSegmentIds.size).toBe(8)
  })

  it('does not infer placeholder, T6 or TU event participation', () => {
    const filtered = result(['org_central_red_army'])
    expect(
      [...filtered.eventIds].some((id) => id.includes('_placeholder')),
    ).toBe(false)
    expect(filtered.eventIds.has('event_t05_rendezvous_placeholder')).toBe(
      false,
    )
    expect(filtered.eventIds.has('event_t05_stay_placeholder')).toBe(false)
  })

  it('combines organization and time visibility by intersection', () => {
    expect(
      combineOrganizationAndTimeVisibility(
        new Set(['event_liping_capture_1934_12_15', 'placeholder']),
        result(['org_red_first_corps']).eventIds,
      ),
    ).toEqual(new Set(['event_liping_capture_1934_12_15']))
  })

  it('supports zero through four selections and rejects the fifth with fixtures', () => {
    let selected: readonly string[] = []
    for (const id of [
      'org_fixture_a',
      'org_fixture_b',
      'org_fixture_c',
      'org_fixture_d',
    ]) {
      const update = updateOrganizationSelection(selected, id, true)
      expect(update.rejected).toBe(false)
      selected = update.selectedIds
    }
    expect(selected).toHaveLength(4)
    const rejected = updateOrganizationSelection(
      selected,
      'org_fixture_e',
      true,
    )
    expect(rejected.rejected).toBe(true)
    expect(rejected.selectedIds).toEqual(selected)
    expect(rejected.reason).toContain('最多选择4个')
    expect(
      updateOrganizationSelection(selected, 'org_fixture_b', false).selectedIds,
    ).toHaveLength(3)
  })

  it('builds the explicit product aggregate tree without historical subordination', () => {
    const tree = buildOrganizationTree(organizations, history, '')
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({
      organizationId: 'org_central_red_army',
      aggregate: true,
    })
    expect(tree[0].children.map((node) => node.organizationId)).toEqual([
      'org_red_first_corps',
    ])
    expect(history.organizationRelations).toHaveLength(1)
    expect(history.organizationRelations[0].relation_type).toBe('renamed_to')
    expect(aggregateMappingsAreNonRecursive(history.aggregateMembers)).toBe(
      true,
    )
  })

  it.each([
    ['1935-07-20', '中国工农红军第一军团', true],
    ['1935-07-21', '中国工农红军第一军', true],
    ['1935-09-21', '中国工农红军第一军', true],
    ['1935-09-22', '中国工农红军第一军团', false],
  ] as const)(
    'resolves the node name and half-open validity at %s',
    (date, expectedName, active) => {
      const child = buildOrganizationTree(organizations, history, date)[0]
        .children[0]
      expect(child.displayName).toBe(expectedName)
      expect(child.activeAtReferenceDate).toBe(active)
    },
  )

  it('renders only real relations and resolves renamed_to from the claim literal', () => {
    const views = resolveOrganizationRelations(
      'org_red_first_corps',
      history.organizationRelations,
      history.claims,
      organizations,
    )
    expect(views).toEqual([
      expect.objectContaining({
        relationType: 'renamed_to',
        label: '改称',
        objectName: '中国工农红军第一军',
        validFrom: '1935-07-21',
        validTo: '1935-09-22',
      }),
    ])
    expect(views.some((view) => /前身|后继/.test(view.label))).toBe(false)
  })

  it('supports other frozen relation types with test fixtures only', () => {
    const fixture: OrganizationRelation = {
      ...history.organizationRelations[0],
      relation_id: 'rel_fixture_reorganized',
      relation_type: 'reorganized_into',
      claim_id: 'claim_fixture',
    }
    expect(
      resolveOrganizationRelations(
        'org_red_first_corps',
        [fixture],
        [],
        organizations,
      )[0].label,
    ).toBe('改编为')
  })

  it('does not mutate production inventories or historical objects', () => {
    const snapshots = {
      events: JSON.stringify(events.events),
      routes: JSON.stringify(routes.routes),
      segments: JSON.stringify(routes.routeSegments),
      organizations: JSON.stringify(organizations.organizations),
      history: JSON.stringify({
        relations: history.organizationRelations,
        claims: history.claims,
        mappings: history.aggregateMembers,
      }),
    }
    result(['org_central_red_army', 'org_red_first_corps'])
    expect(JSON.stringify(events.events)).toBe(snapshots.events)
    expect(JSON.stringify(routes.routes)).toBe(snapshots.routes)
    expect(JSON.stringify(routes.routeSegments)).toBe(snapshots.segments)
    expect(JSON.stringify(organizations.organizations)).toBe(
      snapshots.organizations,
    )
    expect(
      JSON.stringify({
        relations: history.organizationRelations,
        claims: history.claims,
        mappings: history.aggregateMembers,
      }),
    ).toBe(snapshots.history)
  })
})
