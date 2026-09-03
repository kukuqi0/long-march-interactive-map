import { describe, expect, it } from 'vitest'
import { buildPlaybackPlan } from '../../utils/playback'
import { buildTimelineView } from '../../utils/timeline'
import type { HistoryDatasetInput } from '../../types/history'
import { loadT04PlaceDataset } from './loadPlaces'
import { loadT05EventDataset } from './loadEvents'
import {
  loadT06PreOrganizationDataset,
  validateOrganizationDataset,
} from './loadOrganizations'
import { loadT06RouteDataset } from './loadRoutes'
import {
  isActiveInHalfOpenInterval,
  loadT11PreHistoryDataset,
  resolveOrganizationName,
  validateHistoryDataset,
} from './loadHistory'

const places = loadT04PlaceDataset()
const events = loadT05EventDataset(places)
const organizations = loadT06PreOrganizationDataset()
const routes = loadT06RouteDataset(places, organizations)
const dependencies = { places, events, organizations, routes }
const loaded = loadT11PreHistoryDataset(dependencies)

function productionInput(): HistoryDatasetInput {
  return {
    manifest: { ...loaded.manifest! },
    organizationRelations: loaded.organizationRelations.map((item) => ({
      ...item,
    })),
    claims: loaded.claims.map((item) => ({ ...item })),
    disputes: loaded.disputes.map((item) => ({ ...item })),
    sources: loaded.sources.map((item) => ({ ...item })),
    evidenceLinks: loaded.evidenceLinks.map((item) => ({ ...item })),
    aggregateMembers: loaded.aggregateMembers.map((item) => ({ ...item })),
  }
}

function validate(overrides: Partial<HistoryDatasetInput> = {}) {
  return validateHistoryDataset(
    { ...productionInput(), ...overrides },
    dependencies,
  )
}

function codes(result: ReturnType<typeof validate>) {
  return result.errors.map((error) => error.error_code)
}

describe('production history chain', () => {
  it('loads one relation, fourteen claims, one structural dispute, four sources and five evidence links as draft sample data', () => {
    expect(loaded.ok).toBe(true)
    expect(loaded.errors).toEqual([])
    expect(loaded.organizationRelations).toHaveLength(1)
    expect(loaded.claims).toHaveLength(14)
    expect(loaded.disputes).toHaveLength(1)
    expect(loaded.sources).toHaveLength(4)
    expect(loaded.evidenceLinks).toHaveLength(5)
    expect(loaded.aggregateMembers).toHaveLength(1)
    expect(loaded.manifest).toMatchObject({
      dataset_tier: 'sample-draft',
      is_sample: true,
      review_status: 'draft',
      publication_allowed: false,
    })
    expect(
      [
        ...loaded.organizationRelations,
        ...loaded.claims,
        ...loaded.disputes,
        ...loaded.sources,
        ...loaded.evidenceLinks,
      ].every((item) => item.review_status === 'draft'),
    ).toBe(true)
  })

  it('keeps every production FK resolvable without prefix-based fallback', () => {
    const relation = loaded.organizationRelations[0]
    expect(
      organizations.registry.findById(relation.subject_organization_id),
    ).toBeDefined()
    expect(
      organizations.registry.findById(relation.object_organization_id),
    ).toBeDefined()
    expect(
      loaded.claims.some((claim) => claim.claim_id === relation.claim_id),
    ).toBe(true)
    expect(
      loaded.evidenceLinks.every(
        (link) =>
          loaded.claims.some((claim) => claim.claim_id === link.claim_id) &&
          loaded.sources.some((source) => source.source_id === link.source_id),
      ),
    ).toBe(true)
    expect(loaded.sources.map((source) => source.source_id)).toEqual([
      'src_12371_red_army_1935_chronology',
      'src_12371_zunyi_turning_point_2021',
      'src_pla_liping_meeting_2024',
      'src_liping_heritage_2015',
    ])
    expect(
      loaded.sources.every((source) => source.source_id.startsWith('src_')),
    ).toBe(true)
    expect(
      loaded.evidenceLinks.every((link) => link.source_id.startsWith('src_')),
    ).toBe(true)
    expect(
      places.historicalNames.find(
        (item) => item.historical_name_id === 'hname_liping_city_1934',
      )?.claim_id,
    ).toBe('claim_place_liping_city_had_name')
  })

  it('uses only the four controlled predicates and keeps claim time ranges absent', () => {
    expect(new Set(loaded.claims.map((claim) => claim.predicate))).toEqual(
      new Set([
        'renamed_to',
        'had_name',
        'had_participant',
        'route_geometry_variant',
      ]),
    )
    expect(
      loaded.claims.every(
        (claim) =>
          claim.time_precision === null &&
          !('time_start' in claim) &&
          !('time_end' in claim),
      ),
    ).toBe(true)
  })
})

describe('structural dispute validation', () => {
  it('links one unresolved D2 dispute to both existing separated R4 features without evidence fabrication', () => {
    const dispute = loaded.disputes[0]
    expect(dispute).toMatchObject({
      dispute_id: 'dispute_seg_t06_r4_placeholder_route_variants',
      dispute_type: 'route',
      dispute_status: 'D2',
      adopted_claim_id: null,
      review_status: 'draft',
    })
    expect(dispute.competing_claim_ids).toHaveLength(2)
    const competing = dispute.competing_claim_ids.map((id) =>
      loaded.claims.find((claim) => claim.claim_id === id),
    )
    expect(competing).toEqual([
      expect.objectContaining({
        subject_id: 'seg_t06_r4_placeholder',
        object_value: 'feature_t06_r4_a_placeholder',
        claim_data_state: 'disputed',
        claim_confidence: 'C-D',
      }),
      expect.objectContaining({
        subject_id: 'seg_t06_r4_placeholder',
        object_value: 'feature_t06_r4_b_placeholder',
        claim_data_state: 'disputed',
        claim_confidence: 'C-D',
      }),
    ])
    expect(
      routes.featureCollection.features
        .filter(
          (feature) =>
            feature.properties.route_segment_id === 'seg_t06_r4_placeholder',
        )
        .map((feature) => feature.id),
    ).toEqual(['feature_t06_r4_a_placeholder', 'feature_t06_r4_b_placeholder'])
    expect(
      loaded.evidenceLinks.some((link) =>
        dispute.competing_claim_ids.includes(link.claim_id),
      ),
    ).toBe(false)
  })

  it('rejects broken geometry references, duplicate competitors and adopted claims outside the competition', () => {
    const geometryClaims = productionInput().claims as Array<
      Record<string, unknown>
    >
    geometryClaims[3] = {
      ...geometryClaims[3],
      object_value: 'feature_missing',
    }
    expect(codes(validate({ claims: geometryClaims }))).toContain(
      'GEOMETRY_OBJECT_NOT_FOUND',
    )

    const disputes = productionInput().disputes as Array<
      Record<string, unknown>
    >
    const competing = disputes[0].competing_claim_ids as string[]
    disputes[0] = {
      ...disputes[0],
      competing_claim_ids: [competing[0], competing[0]],
      adopted_claim_id: 'claim_missing',
    }
    expect(codes(validate({ disputes }))).toEqual(
      expect.arrayContaining([
        'DUPLICATE_COMPETING_CLAIM',
        'ADOPTED_CLAIM_NOT_COMPETING',
        'UNRESOLVED_DISPUTE_CANNOT_ADOPT',
      ]),
    )
  })

  it('rejects unknown dispute fields, missing competitors and cross-subject competition', () => {
    const unknown = productionInput().disputes as Array<Record<string, unknown>>
    unknown[0] = { ...unknown[0], confidence_percent: 50 }
    expect(codes(validate({ disputes: unknown }))).toContain('UNKNOWN_FIELD')

    const missing = productionInput().disputes as Array<Record<string, unknown>>
    missing[0] = {
      ...missing[0],
      competing_claim_ids: [
        'claim_seg_t06_r4_placeholder_route_variant_a',
        'claim_missing',
      ],
    }
    expect(codes(validate({ disputes: missing }))).toContain(
      'COMPETING_CLAIM_NOT_FOUND',
    )

    const crossSubject = productionInput().disputes as Array<
      Record<string, unknown>
    >
    crossSubject[0] = {
      ...crossSubject[0],
      competing_claim_ids: [
        'claim_seg_t06_r4_placeholder_route_variant_a',
        'claim_event_liping_capture_had_participant',
      ],
    }
    expect(codes(validate({ disputes: crossSubject }))).toContain(
      'COMPETING_CONTEXT_MISMATCH',
    )
  })
})

describe('organization and rename contract', () => {
  const firstCorps = organizations.registry.findById('org_red_first_corps')!

  it('uses strict organization fields and rejects aliases or other schema expansion', () => {
    expect(firstCorps).toMatchObject({
      name: '中国工农红军第一军团',
      organization_type: 'military',
      echelon: 'corps',
      valid_from: '1934-10-01',
      valid_to: '1935-09-22',
      time_precision: 'T4',
      review_status: 'draft',
    })
    expect(firstCorps.description).toContain('不是成立日期')
    const invalid = validateOrganizationDataset({
      manifest: organizations.manifest!,
      organizations: [{ ...firstCorps, aliases: ['红一军团'] }],
    })
    expect(invalid.errors).toContainEqual(
      expect.objectContaining({
        field: 'aliases',
        error_code: 'UNKNOWN_OR_PROHIBITED_FIELD',
      }),
    )
  })

  it('applies half-open organization and relation boundaries without subtracting a day', () => {
    expect(
      isActiveInHalfOpenInterval('1934-10-01', '1935-09-22', '1935-07-20'),
    ).toBe(true)
    expect(
      isActiveInHalfOpenInterval('1934-10-01', '1935-09-22', '1935-07-21'),
    ).toBe(true)
    expect(
      isActiveInHalfOpenInterval('1934-10-01', '1935-09-22', '1935-09-21'),
    ).toBe(true)
    expect(
      isActiveInHalfOpenInterval('1934-10-01', '1935-09-22', '1935-09-22'),
    ).toBe(false)
    expect(
      isActiveInHalfOpenInterval('1935-07-21', '1935-09-22', '1935-07-20'),
    ).toBe(false)
    expect(
      isActiveInHalfOpenInterval('1935-07-21', '1935-09-22', '1935-07-21'),
    ).toBe(true)
    expect(
      isActiveInHalfOpenInterval('1935-07-21', '1935-09-22', '1935-09-21'),
    ).toBe(true)
    expect(
      isActiveInHalfOpenInterval('1935-07-21', '1935-09-22', '1935-09-22'),
    ).toBe(false)
  })

  it('resolves the current name from organization.name plus the active renamed_to claim literal', () => {
    const resolve = (date: string) =>
      resolveOrganizationName(
        firstCorps,
        date,
        loaded.organizationRelations,
        loaded.claims,
      )
    expect(resolve('1935-07-20')).toMatchObject({
      ok: true,
      displayName: '中国工农红军第一军团',
      source: 'organization.name',
    })
    expect(resolve('1935-07-21')).toMatchObject({
      ok: true,
      displayName: '中国工农红军第一军',
      source: 'renamed_to_claim_literal',
    })
    expect(resolve('1935-09-21')).toMatchObject({
      ok: true,
      displayName: '中国工农红军第一军',
    })
    expect(resolve('1935-09-22')).toEqual({
      ok: false,
      reason: 'organization_inactive',
    })
  })

  it('allows same-ID renamed_to but rejects same-ID non-rename relations', () => {
    expect(loaded.organizationRelations[0]).toMatchObject({
      relation_type: 'renamed_to',
      subject_organization_id: 'org_red_first_corps',
      object_organization_id: 'org_red_first_corps',
    })
    const invalid = productionInput().organizationRelations as Array<
      Record<string, unknown>
    >
    invalid[0] = { ...invalid[0], relation_type: 'subordinate_to' }
    expect(codes(validate({ organizationRelations: invalid }))).toContain(
      'SELF_RELATION_NOT_ALLOWED',
    )
  })
})

describe('claim, source and evidence validation', () => {
  it('strictly limits had_name and had_participant shapes and rejects unknown predicates', () => {
    const claims = productionInput().claims as Array<Record<string, unknown>>
    claims[1] = { ...claims[1], subject_type: 'event' }
    expect(codes(validate({ claims }))).toContain('INVALID_HAD_NAME_SHAPE')

    const unknown = productionInput().claims as Array<Record<string, unknown>>
    unknown[0] = { ...unknown[0], predicate: 'participated_in' }
    expect(codes(validate({ claims: unknown }))).toContain('UNKNOWN_PREDICATE')
  })

  it('rejects missing polymorphic subjects, entity objects and relation claims', () => {
    const subject = productionInput().claims as Array<Record<string, unknown>>
    subject[2] = { ...subject[2], subject_id: 'event_missing' }
    expect(codes(validate({ claims: subject }))).toContain('SUBJECT_NOT_FOUND')

    const object = productionInput().claims as Array<Record<string, unknown>>
    object[2] = { ...object[2], object_value: 'org_missing' }
    expect(codes(validate({ claims: object }))).toEqual(
      expect.arrayContaining([
        'ENTITY_OBJECT_NOT_FOUND',
        'PARTICIPANT_ORGANIZATION_NOT_FOUND',
      ]),
    )

    const relations = productionInput().organizationRelations as Array<
      Record<string, unknown>
    >
    relations[0] = { ...relations[0], claim_id: 'claim_missing' }
    expect(codes(validate({ organizationRelations: relations }))).toContain(
      'CLAIM_NOT_FOUND',
    )
  })

  it('rejects source and evidence enums, non-draft evidence and broken evidence FKs', () => {
    const sources = productionInput().sources as Array<Record<string, unknown>>
    sources[0] = { ...sources[0], source_type: 'ST11' }
    expect(codes(validate({ sources }))).toContain('INVALID_SOURCE_TYPE')

    const links = productionInput().evidenceLinks as Array<
      Record<string, unknown>
    >
    links[0] = {
      ...links[0],
      evidence_relation: 'proves',
      review_status: 'sourced',
    }
    expect(codes(validate({ evidenceLinks: links }))).toEqual(
      expect.arrayContaining([
        'INVALID_EVIDENCE_RELATION',
        'INVALID_REVIEW_STATUS',
      ]),
    )

    const broken = productionInput().evidenceLinks as Array<
      Record<string, unknown>
    >
    broken[0] = { ...broken[0], source_id: 'src_missing' }
    expect(codes(validate({ evidenceLinks: broken }))).toContain(
      'SOURCE_NOT_FOUND',
    )

    const legacyPrefix = productionInput().sources as Array<
      Record<string, unknown>
    >
    legacyPrefix[0] = {
      ...legacyPrefix[0],
      source_id: 'source_legacy_prefix',
    }
    expect(codes(validate({ sources: legacyPrefix }))).toContain(
      'INVALID_STABLE_ID',
    )

    const legacyFk = productionInput().evidenceLinks as Array<
      Record<string, unknown>
    >
    legacyFk[0] = { ...legacyFk[0], source_id: 'source_legacy_prefix' }
    expect(codes(validate({ evidenceLinks: legacyFk }))).toContain(
      'INVALID_SOURCE_ID_PREFIX',
    )
  })

  it('accepts frozen-schema nullable draft evidence text without treating it as publishable', () => {
    const links = productionInput().evidenceLinks as Array<
      Record<string, unknown>
    >
    links[0] = {
      ...links[0],
      locator: null,
      excerpt: null,
      interpretation_note: null,
    }
    const result = validate({ evidenceLinks: links })
    expect(result.ok).toBe(true)
    expect(result.evidenceLinks[0]).toMatchObject({
      locator: null,
      excerpt: null,
      interpretation_note: null,
      review_status: 'draft',
    })
  })
})

describe('place, event and aggregate integration', () => {
  it('adds one S1 representative Point with RFC7946 coordinate order and a strict boundary note', () => {
    const place = places.places.find(
      (item) => item.place_id === 'place_liping_city_1934',
    )!
    const feature = places.featureCollection.features.find(
      (item) => item.properties.place_id === place.place_id,
    )!
    expect(places.places).toHaveLength(8)
    expect(places.historicalNames).toHaveLength(10)
    expect(places.featureCollection.features).toHaveLength(4)
    expect(place).toMatchObject({
      geometry_type: 'point',
      spatial_precision: 'S1',
      match_status: 'probable',
    })
    expect(place.match_note).toContain('S1聚落级代表点')
    expect(place.match_note).toContain('不表示1934-12-15具体战斗位置')
    expect(feature.geometry.coordinates).toEqual([
      109.13469444444445, 26.23466666666667,
    ])
    expect(feature.properties.is_representative_point).toBe(true)
  })

  it('adds one independent real T1 event without changing the nine placeholder business records', () => {
    const real = events.events.find(
      (item) => item.event_id === 'event_liping_capture_1934_12_15',
    )!
    expect(events.events).toHaveLength(10)
    expect(real).toMatchObject({
      title: '红一军团攻占黎平县城',
      event_type: 'battle',
      time_start: '1934-12-15',
      time_end: '1934-12-15',
      time_precision: 'T1',
      place_id: 'place_liping_city_1934',
      spatial_precision: 'S1',
      review_status: 'draft',
    })
    expect('coordinates' in real).toBe(false)
    const point = events.featureCollection.features.find(
      (item) => item.properties.event_id === real.event_id,
    )!
    expect(point.geometry.coordinates).toEqual([
      109.13469444444445, 26.23466666666667,
    ])
    expect(
      events.events.filter((item) => item.event_id.includes('_placeholder')),
    ).toHaveLength(9)
    expect(
      events.events
        .filter((item) => item.event_id.includes('_placeholder'))
        .map(
          ({
            event_id,
            title,
            event_type,
            time_original_text,
            time_start,
            time_end,
            place_id,
          }) => ({
            event_id,
            title,
            event_type,
            time_original_text,
            time_start,
            time_end,
            place_id,
          }),
        ),
    ).toEqual([
      {
        event_id: 'event_t05_battle_placeholder',
        title: '待核验占位：战役类型事件A',
        event_type: 'battle',
        time_original_text: '结构测试：某日（待核验占位）',
        time_start: '1934-10-02',
        time_end: '1934-10-02',
        place_id: 'place_t04_s0_placeholder',
      },
      {
        event_id: 'event_t05_meeting_placeholder',
        title: '待核验占位：会议类型事件A',
        event_type: 'meeting',
        time_original_text: '结构测试：某月上旬（待核验占位）',
        time_start: '1934-11-01',
        time_end: '1934-11-10',
        place_id: 'place_t04_s1_placeholder',
      },
      {
        event_id: 'event_t05_movement_placeholder',
        title: '待核验占位：行动类型事件A',
        event_type: 'movement',
        time_original_text: '结构测试：某月（待核验占位）',
        time_start: '1935-02-01',
        time_end: '1935-02-28',
        place_id: 'place_t04_s2_placeholder',
      },
      {
        event_id: 'event_t05_river_crossing_placeholder',
        title: '待核验占位：渡河类型事件A',
        event_type: 'river_crossing',
        time_original_text: '结构测试：某时间区间（待核验占位）',
        time_start: '1935-03-01',
        time_end: '1935-03-03',
        place_id: 'place_t04_s2_placeholder',
      },
      {
        event_id: 'event_t05_mountain_crossing_placeholder',
        title: '待核验占位：翻山类型事件A',
        event_type: 'mountain_crossing',
        time_original_text: '结构测试：某年（待核验占位）',
        time_start: '1935-01-01',
        time_end: '1935-12-31',
        place_id: 'place_t04_s3_placeholder',
      },
      {
        event_id: 'event_t05_rendezvous_placeholder',
        title: '待核验占位：会师类型事件A',
        event_type: 'rendezvous',
        time_original_text: '结构测试：仅先后顺序（待核验占位）',
        time_start: null,
        time_end: null,
        place_id: 'place_t04_s1_placeholder',
      },
      {
        event_id: 'event_t05_stay_placeholder',
        title: '待核验占位：驻留类型事件A',
        event_type: 'stay',
        time_original_text: '时间未知/待核验占位',
        time_start: null,
        time_end: null,
        place_id: null,
      },
      {
        event_id: 'event_t05_reorganization_placeholder',
        title: '待核验占位：改编类型事件A',
        event_type: 'reorganization',
        time_original_text: '结构测试：某日（待核验占位）',
        time_start: '1935-04-05',
        time_end: '1935-04-05',
        place_id: 'place_t04_s4_placeholder',
      },
      {
        event_id: 'event_t05_other_placeholder',
        title: '待核验占位：其他类型事件A',
        event_type: 'other',
        time_original_text: '结构测试：某时间区间（待核验占位）',
        time_start: '1935-05-01',
        time_end: '1935-05-02',
        place_id: 'place_t04_s5_placeholder',
      },
    ])
  })

  it('keeps product aggregation non-recursive and distinct from historical relations', () => {
    expect(loaded.aggregateIndex.membersOf('org_central_red_army')).toEqual([
      'org_red_first_corps',
    ])
    expect(
      loaded.aggregateIndex.matchSources(
        'org_central_red_army',
        'org_red_first_corps',
      ),
    ).toEqual(['aggregate_member'])
    expect(
      loaded.aggregateIndex.matchSources(
        'org_red_first_corps',
        'org_central_red_army',
      ),
    ).toEqual([])
    expect(
      loaded.organizationRelations.some(
        (item) => item.relation_type === 'subordinate_to',
      ),
    ).toBe(false)
  })
})

describe('detail, time, timeline and playback inventory regression', () => {
  it('preserves all route foreign keys and gives the real corps zero direct routes', () => {
    expect(routes.routes).toHaveLength(2)
    expect(routes.routeSegments).toHaveLength(8)
    expect(
      routes.routes.every(
        (route) => route.organization_id === 'org_central_red_army',
      ),
    ).toBe(true)
    expect(
      routes.routeSegments.every(
        (segment) => segment.organization_id === 'org_central_red_army',
      ),
    ).toBe(true)
    expect(
      routes.routes.filter(
        (route) => route.organization_id === 'org_red_first_corps',
      ),
    ).toHaveLength(0)
  })

  it('keeps inclusive event filtering while organization time uses a separate half-open helper', () => {
    const real = events.events.find(
      (item) => item.event_id === 'event_liping_capture_1934_12_15',
    )!
    expect(real.time_start).toBe('1934-12-15')
    expect(real.time_end).toBe('1934-12-15')
    expect(real.time_precision).toBe('T1')
  })

  it('derives 14 dated items, two sequence items and two unknown items from actual inventory', () => {
    const timeline = buildTimelineView(
      events.events,
      routes.routes,
      routes.routeSegments,
      new Set(events.events.map((item) => item.event_id)),
      new Set(routes.routeSegments.map((item) => item.route_segment_id)),
    )
    expect(timeline.errors).toEqual([])
    expect(timeline.dated).toHaveLength(14)
    expect(timeline.sequenceOnly).toHaveLength(2)
    expect(timeline.unknown).toHaveLength(2)
  })

  it('derives eight event anchors, seven route steps and a 15-step playback queue', () => {
    const plan = buildPlaybackPlan(
      events.events,
      routes.routes,
      routes.routeSegments,
      routes.featureCollection,
    )
    expect(plan.errors).toEqual([])
    expect(
      plan.steps.filter((step) => step.kind === 'event_anchor'),
    ).toHaveLength(8)
    expect(
      plan.steps.filter((step) => step.kind === 'route_segment'),
    ).toHaveLength(7)
    expect(plan.steps).toHaveLength(15)
  })
})
