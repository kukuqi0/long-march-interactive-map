import { describe, expect, it } from 'vitest'
import schema from './project-data.schema.json'
import {
  ProjectDataValidationError,
  buildValidationReport,
  evaluateClaimPublicationReadiness,
  getCurrentProjectValidationInput,
  loadValidatedProjectData,
  sortValidationIssues,
  validateProjectData,
} from './validation'
import type {
  ProjectValidationInput,
  ValidationIssue,
} from '../../types/validation'
import type { Claim, EvidenceLink, Source } from '../../types/history'
import { sourceQualities, sourceTypes } from '../../types/history'

type MutableRecord = Record<string, unknown>

function cloneInput(): ProjectValidationInput {
  return structuredClone(getCurrentProjectValidationInput())
}

function records(value: unknown): MutableRecord[] {
  return value as MutableRecord[]
}

function expectStructuralCode(input: ProjectValidationInput, code: string) {
  const result = validateProjectData(input)
  expect(result.report.structural.status).toBe('fail')
  expect(
    result.report.structural.issues.some((issue) => issue.code === code),
  ).toBe(true)
  return result
}

describe('unified project validation', () => {
  it('loads current production sample with zero structural blockers and blocked publication', () => {
    const result = validateProjectData(getCurrentProjectValidationInput())

    expect(result.report.structural).toMatchObject({
      status: 'pass',
      blocking_error_count: 0,
    })
    expect(result.report.publication.status).toBe('blocked')
    expect(result.report.publication.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PUBLICATION_DATASET_BLOCKED' }),
        expect.objectContaining({ code: 'PUBLICATION_DATASET_TIER_BLOCKED' }),
      ]),
    )
  })

  it('accepts a minimal legal fixture without relying on production stable IDs', () => {
    const input = cloneInput()
    input.places.places = []
    input.places.historicalNames = []
    input.places.geometries = { type: 'FeatureCollection', features: [] }
    input.events.events = []
    input.organizations.organizations = []
    input.routes.routes = []
    input.routes.routeSegments = []
    input.routes.geometries = { type: 'FeatureCollection', features: [] }
    input.history.organizationRelations = []
    input.history.claims = []
    input.history.sources = []
    input.history.evidenceLinks = []
    input.history.disputes = []
    input.history.aggregateMembers = []

    expect(validateProjectData(input).report.structural).toMatchObject({
      status: 'pass',
      blocking_error_count: 0,
    })
  })

  it('rejects sample-draft manifests placed under a published path', () => {
    const input = cloneInput()
    input.history.datasetPath = 'src/data/published/history'
    expectStructuralCode(input, 'SAMPLE_DATA_IN_PUBLISHED_PATH')
  })

  it('keeps the expected inventory and all ten historical name claim FKs closed', () => {
    const { datasets } = validateProjectData(getCurrentProjectValidationInput())
    const claimIds = new Set(
      datasets.history.claims.map((claim) => claim.claim_id),
    )

    expect(datasets.places.places).toHaveLength(8)
    expect(datasets.places.historicalNames).toHaveLength(10)
    expect(datasets.events.events).toHaveLength(10)
    expect(datasets.organizations.organizations).toHaveLength(2)
    expect(datasets.history.organizationRelations).toHaveLength(1)
    expect(datasets.history.claims).toHaveLength(14)
    expect(datasets.history.sources).toHaveLength(4)
    expect(datasets.history.evidenceLinks).toHaveLength(5)
    expect(datasets.history.disputes).toHaveLength(1)
    expect(datasets.routes.routes).toHaveLength(2)
    expect(datasets.routes.routeSegments).toHaveLength(8)
    expect(
      datasets.places.historicalNames.filter((name) =>
        claimIds.has(name.claim_id),
      ),
    ).toHaveLength(10)
  })

  it('loads exactly nine unknown C-U placeholder name claims without evidence', () => {
    const { datasets } = validateProjectData(getCurrentProjectValidationInput())
    const placeholders = datasets.history.claims.filter((claim) =>
      claim.claim_id.startsWith('claim_t04_'),
    )
    const namesByClaim = new Map(
      datasets.places.historicalNames.map((name) => [name.claim_id, name]),
    )

    expect(placeholders).toHaveLength(9)
    for (const claim of placeholders) {
      const name = namesByClaim.get(claim.claim_id)
      expect(name).toBeDefined()
      expect(claim).toMatchObject({
        subject_type: 'place',
        subject_id: name?.place_id,
        predicate: 'had_name',
        object_type: 'literal',
        object_value: name?.name,
        claim_data_state: 'unknown',
        claim_confidence: 'C-U',
        review_status: 'draft',
      })
      expect(
        datasets.history.evidenceLinks.filter(
          (evidence) => evidence.claim_id === claim.claim_id,
        ),
      ).toHaveLength(0)
    }
  })

  it('reports a removed historical name claim as a located broken FK without repairing it', () => {
    const input = cloneInput()
    input.history.claims = records(input.history.claims).filter(
      (claim) => claim.claim_id !== 'claim_t04_s0_placeholder',
    )
    const before = records(input.history.claims).length
    const result = expectStructuralCode(input, 'BROKEN_FOREIGN_KEY')

    expect(result.report.structural.issues).toContainEqual(
      expect.objectContaining({
        entity_type: 'historical_place_name',
        entity_id: 'hname_t04_s0_placeholder',
        field: 'claim_id',
      }),
    )
    expect(records(input.history.claims)).toHaveLength(before)
  })

  it.each([
    ['subject_id', 'place_missing'],
    ['object_value', '错误名称'],
    ['predicate', 'renamed_to'],
    ['object_type', 'entity'],
  ])(
    'rejects historical name claim semantic mismatch in %s',
    (field, value) => {
      const input = cloneInput()
      const claim = records(input.history.claims).find(
        (item) => item.claim_id === 'claim_t04_s0_placeholder',
      )
      if (!claim) throw new Error('fixture claim missing')
      claim[field] = value

      const result = validateProjectData(input)
      expect(result.report.structural.status).toBe('fail')
      if (field === 'subject_id' || field === 'object_value')
        expect(
          result.report.structural.issues.some(
            (issue) => issue.code === 'HISTORICAL_NAME_CLAIM_MISMATCH',
          ),
        ).toBe(true)
    },
  )

  it('maps missing required fields and unknown fields to stable schema codes', () => {
    const missing = cloneInput()
    delete records(missing.history.claims)[0].object_value
    expectStructuralCode(missing, 'SCHEMA_REQUIRED_FIELD')

    const unknown = cloneInput()
    records(unknown.history.claims)[0].aliases = []
    expectStructuralCode(unknown, 'SCHEMA_UNKNOWN_FIELD')
  })

  it('rejects enum drift, old source prefixes and duplicate IDs', () => {
    const enumInput = cloneInput()
    records(enumInput.routes.routeSegments)[0].route_certainty = 'R9'
    expectStructuralCode(enumInput, 'INVALID_ENUM')

    const prefixInput = cloneInput()
    records(prefixInput.history.sources)[0].source_id = 'source_wrong_prefix'
    expectStructuralCode(prefixInput, 'INVALID_ID_PREFIX')

    const duplicateInput = cloneInput()
    const sources = records(duplicateInput.history.sources)
    sources.push(structuredClone(sources[0]))
    expectStructuralCode(duplicateInput, 'DUPLICATE_ID')
  })

  it.each(sourceTypes)(
    'accepts frozen source type %s in a fixture',
    (sourceType) => {
      const input = cloneInput()
      records(input.history.sources)[0].source_type = sourceType
      expect(validateProjectData(input).report.structural.status).toBe('pass')
    },
  )

  it.each(sourceQualities)(
    'accepts frozen source quality %s in a fixture',
    (sourceQuality) => {
      const input = cloneInput()
      records(input.history.sources)[0].source_quality = sourceQuality
      expect(validateProjectData(input).report.structural.status).toBe('pass')
    },
  )

  it('accepts omitted optional source URL and private file location', () => {
    const input = cloneInput()
    const source = records(input.history.sources)[0]
    delete source.public_url
    delete source.file_location
    expect(validateProjectData(input).report.structural.status).toBe('pass')
  })

  it('rejects invalid review status structurally', () => {
    const input = cloneInput()
    records(input.history.claims)[0].review_status = 'published_without_gate'
    expectStructuralCode(input, 'INVALID_ENUM')
  })

  it.each([
    [
      'historical place place',
      (input: ProjectValidationInput) =>
        (records(input.places.historicalNames)[0].place_id = 'place_missing'),
    ],
    [
      'event place',
      (input: ProjectValidationInput) =>
        (records(input.events.events)[0].place_id = 'place_missing'),
    ],
    [
      'route organization',
      (input: ProjectValidationInput) =>
        (records(input.routes.routes)[0].organization_id = 'org_missing'),
    ],
    [
      'segment route',
      (input: ProjectValidationInput) =>
        (records(input.routes.routeSegments)[0].route_id = 'route_missing'),
    ],
    [
      'relation claim',
      (input: ProjectValidationInput) =>
        (records(input.history.organizationRelations)[0].claim_id =
          'claim_missing'),
    ],
    [
      'evidence source',
      (input: ProjectValidationInput) =>
        (records(input.history.evidenceLinks)[0].source_id = 'src_missing'),
    ],
    [
      'dispute claim',
      (input: ProjectValidationInput) =>
        (records(input.history.disputes)[0].competing_claim_ids = [
          'claim_missing',
          'claim_other',
        ]),
    ],
  ])('detects broken %s FK', (_label, mutate) => {
    const input = cloneInput()
    mutate(input)
    expectStructuralCode(input, 'BROKEN_FOREIGN_KEY')
  })

  it('rejects a missing geometry object and never creates a third geometry', () => {
    const input = cloneInput()
    const claims = records(input.history.claims)
    const claim = claims.find(
      (item) => item.predicate === 'route_geometry_variant',
    )
    if (!claim) throw new Error('R4 claim missing')
    claim.object_value = 'feature_third_generated_geometry'
    const featureCount = (input.routes.geometries as { features: unknown[] })
      .features.length

    expectStructuralCode(input, 'INVALID_GEOMETRY_REF')
    expect(
      (input.routes.geometries as { features: unknown[] }).features,
    ).toHaveLength(featureCount)
  })

  it('rejects reverse organization ranges while preserving half-open semantics', () => {
    const input = cloneInput()
    const organization = records(input.organizations.organizations).find(
      (item) => item.organization_id === 'org_red_first_corps',
    )
    if (!organization) throw new Error('organization missing')
    organization.valid_from = '1935-09-22'
    organization.valid_to = '1935-07-21'

    expectStructuralCode(input, 'INVALID_TIME_RANGE')
  })

  it('accepts T6, TU, R1-R4, R5 without geometry and RU without geometry', () => {
    const result = validateProjectData(getCurrentProjectValidationInput())
    expect(result.report.structural.status).toBe('pass')
    expect(
      result.datasets.events.events.some(
        (event) => event.time_precision === 'T6',
      ),
    ).toBe(true)
    expect(
      result.datasets.events.events.some(
        (event) => event.time_precision === 'TU',
      ),
    ).toBe(true)
    expect(
      new Set(
        result.datasets.routes.routeSegments.map(
          (segment) => segment.route_certainty,
        ),
      ),
    ).toEqual(new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'RU']))
    for (const segment of result.datasets.routes.routeSegments.filter(
      (item) => item.route_certainty === 'R5' || item.route_certainty === 'RU',
    ))
      expect(segment.geometry_ref).toBeNull()
  })

  it('rejects geometry on R5 and invalid finite coordinate ranges', () => {
    const r5Input = cloneInput()
    const r5 = records(r5Input.routes.routeSegments).find(
      (item) => item.route_certainty === 'R5',
    )
    if (!r5) throw new Error('R5 missing')
    r5.geometry_ref = 'geom_invalid'
    expect(validateProjectData(r5Input).report.structural.status).toBe('fail')

    const coordinateInput = cloneInput()
    const feature = (
      coordinateInput.places.geometries as { features: MutableRecord[] }
    ).features[0]
    ;(feature.geometry as { coordinates: unknown[] }).coordinates = [999, 999]
    expect(validateProjectData(coordinateInput).report.structural.status).toBe(
      'fail',
    )
  })

  it('enforces dispute competing and adopted-claim rules', () => {
    const tooFew = cloneInput()
    records(tooFew.history.disputes)[0].competing_claim_ids = [
      'claim_seg_t06_r4_placeholder_route_variant_a',
    ]
    expect(validateProjectData(tooFew).report.structural.status).toBe('fail')

    const duplicate = cloneInput()
    records(duplicate.history.disputes)[0].competing_claim_ids = [
      'claim_seg_t06_r4_placeholder_route_variant_a',
      'claim_seg_t06_r4_placeholder_route_variant_a',
    ]
    expect(validateProjectData(duplicate).report.structural.status).toBe('fail')

    const d2Adopted = cloneInput()
    records(d2Adopted.history.disputes)[0].adopted_claim_id =
      'claim_seg_t06_r4_placeholder_route_variant_a'
    expect(validateProjectData(d2Adopted).report.structural.status).toBe('fail')
  })

  it('accepts nullable draft evidence fields and all frozen evidence relations in fixtures', () => {
    for (const relation of ['supports', 'contradicts', 'background']) {
      const input = cloneInput()
      const evidence = records(input.history.evidenceLinks)[0]
      evidence.evidence_relation = relation
      evidence.locator = null
      evidence.excerpt = null
      evidence.interpretation_note = null
      expect(validateProjectData(input).report.structural.status).toBe('pass')
    }
  })

  it('unifies traceability publication rules', () => {
    const current = validateProjectData(
      getCurrentProjectValidationInput(),
    ).datasets
    const claim = {
      ...current.history.claims[0],
      review_status: 'published',
    } as unknown as Claim
    const evidence = [
      {
        ...current.history.evidenceLinks[0],
        claim_id: claim.claim_id,
        evidence_relation: 'supports',
        locator: '第1页',
      },
    ] as EvidenceLink[]
    const sources = current.history.sources as Source[]

    expect(
      evaluateClaimPublicationReadiness(claim, evidence, sources, {
        publication_allowed: true,
        dataset_tier: 'published',
      }),
    ).toMatchObject({ meetsMinimum: true, code: 'complete' })
    expect(
      evaluateClaimPublicationReadiness(claim, [], sources, {
        publication_allowed: true,
        dataset_tier: 'published',
      }).code,
    ).toBe('missing_supports')
    expect(
      evaluateClaimPublicationReadiness(
        claim,
        [{ ...evidence[0], locator: null }],
        sources,
        {
          publication_allowed: true,
          dataset_tier: 'published',
        },
      ).code,
    ).toBe('missing_locator')
    expect(
      evaluateClaimPublicationReadiness(claim, evidence, sources, {
        publication_allowed: false,
        dataset_tier: 'sample-draft',
      }).code,
    ).toBe('dataset_not_publishable')
  })

  it('keeps unknown placeholder claims structurally legal but publication blocked for all required reasons', () => {
    const result = validateProjectData(getCurrentProjectValidationInput())
    const issues = result.report.publication.issues.filter(
      (issue) => issue.entity_id === 'claim_t04_s0_placeholder',
    )
    expect(result.report.structural.status).toBe('pass')
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'PUBLICATION_REVIEW_STATUS_BLOCKED',
        'PUBLICATION_CLAIM_STATE_BLOCKED',
        'PUBLICATION_CONFIDENCE_BLOCKED',
        'PUBLICATION_MISSING_SUPPORT',
        'PUBLICATION_MISSING_LOCATOR',
      ]),
    )
  })

  it('keeps the current R4 dispute structurally valid and publication blocked', () => {
    const result = validateProjectData(getCurrentProjectValidationInput())
    expect(result.report.structural.status).toBe('pass')
    expect(
      result.report.publication.issues.filter(
        (issue) =>
          issue.entity_id === 'dispute_seg_t06_r4_placeholder_route_variants',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PUBLICATION_R4_MISSING_EVIDENCE' }),
      ]),
    )
    expect(
      result.report.publication.issues.some(
        (issue) =>
          issue.code === 'PUBLICATION_CONFIDENCE_BLOCKED' &&
          issue.entity_id.startsWith('claim_seg_t06_r4_'),
      ),
    ).toBe(false)
  })

  it('builds deterministic located reports with machine-readable codes', () => {
    const issues: ValidationIssue[] = [
      {
        code: 'Z_CODE',
        severity: 'warning',
        scope: 'publication',
        entity_type: 'source',
        entity_id: 'src_z',
        field: 'title',
        path: 'sources.json#src_z.title',
        file: 'sources.json',
        message: 'z',
      },
      {
        code: 'A_CODE',
        severity: 'error',
        scope: 'structural',
        entity_type: 'claim',
        entity_id: 'claim_a',
        field: 'object_value',
        path: 'claims.json#claim_a.object_value',
        file: 'claims.json',
        message: 'a',
      },
    ]
    const once = sortValidationIssues(issues)
    const twice = sortValidationIssues([...issues].reverse())
    const report = buildValidationReport(once, [])

    expect(once).toEqual(twice)
    expect(report.structural.status).toBe('fail')
    expect(report.issues[0]).toMatchObject({
      code: 'A_CODE',
      entity_id: 'claim_a',
      field: 'object_value',
      file: 'claims.json',
    })
  })

  it('uses strict JSON Schema descriptions without adding a runtime dependency', () => {
    expect(schema.$schema).toContain('2020-12')
    expect(schema.additionalProperties).toBe(false)
    expect(schema.$defs.claim.additionalProperties).toBe(false)
    expect(schema.$defs.source.properties.source_id.pattern).toBe('^src_')
    expect(schema.$defs.evidenceLink.properties.locator.$ref).toBe(
      '#/$defs/nullableString',
    )
  })

  it('blocks loader use only for structural failures, not publication blockers', () => {
    const loaded = loadValidatedProjectData()
    expect(loaded.report.structural.status).toBe('pass')
    expect(loaded.report.publication.status).toBe('blocked')

    const invalid = cloneInput()
    records(invalid.history.claims)[0].subject_id = 'org_missing'
    expect(() => loadValidatedProjectData(invalid)).toThrow(
      ProjectDataValidationError,
    )
  })
})
