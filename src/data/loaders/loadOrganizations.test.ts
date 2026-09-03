import { describe, expect, it } from 'vitest'
import {
  organizationEchelons,
  organizationTimePrecisions,
  organizationTypes,
  type Organization,
} from '../../types/organization'
import {
  loadT06PreOrganizationDataset,
  validateOrganizationDataset,
} from './loadOrganizations'

const loaded = loadT06PreOrganizationDataset()

function manifest() {
  return {
    dataset_tier: 'sample-draft',
    is_sample: true,
    publication_allowed: false,
    review_status: 'draft',
    data_version: 'v0.1-t06-pre-sample-draft',
    content_note: '结构测试/待核验占位数据，不代表正式历史数据',
  }
}

function organizationFixture(overrides: Partial<Organization> = {}) {
  return {
    organization_id: 'org_fixture',
    name: '待核验组织占位',
    organization_type: 'military',
    echelon: 'aggregate',
    valid_from: null,
    valid_to: null,
    time_precision: 'TU',
    description: '开发期聚合对象，有效期待核验；非发布结构测试数据。',
    review_status: 'draft',
    created_at: '2026-07-22T00:00:00.000Z',
    updated_at: '2026-07-22T00:00:00.000Z',
    data_version: 'v0.1-t06-pre-sample-draft',
    ...overrides,
  } satisfies Organization
}

function validate(
  organizations: unknown = [organizationFixture()],
  manifestValue: unknown = manifest(),
  datasetPath?: string,
) {
  return validateOrganizationDataset({
    manifest: manifestValue,
    organizations,
    datasetPath,
  })
}

function errorCodes(result: ReturnType<typeof validate>) {
  return result.errors.map((error) => error.error_code)
}

describe('organization registry', () => {
  it('loads the aggregate and one fully validated draft historical organization', () => {
    expect(loaded.ok).toBe(true)
    expect(loaded.errors).toEqual([])
    expect(loaded.organizations).toHaveLength(2)
    expect(loaded.organizations[0]).toMatchObject({
      organization_id: 'org_central_red_army',
      name: '中央红军',
      organization_type: 'military',
      echelon: 'aggregate',
      valid_from: null,
      valid_to: null,
      time_precision: 'TU',
      review_status: 'draft',
    })
    expect(loaded.manifest).toMatchObject({
      dataset_tier: 'sample-draft',
      is_sample: true,
      publication_allowed: false,
      review_status: 'draft',
    })
  })

  it('keeps the aggregate disclaimer and non-publication boundary explicit', () => {
    const description = loaded.organizations[0].description ?? ''
    expect(description).toContain('开发期聚合对象')
    expect(description).toContain(
      '不代表所有下级单位在同一时间、同一地点或使用同一路线',
    )
    expect(description).toContain('待人工核验')
    expect(description).toContain('不会提升其可信度或审核状态')
    expect(description).toContain('不是完整组织体系或正式历史编制结论')
  })

  it('recognizes the complete frozen enum sets', () => {
    expect(organizationTypes).toEqual([
      'political',
      'military',
      'temporary_detachment',
    ])
    expect(organizationEchelons).toEqual([
      'aggregate',
      'army_group',
      'corps',
      'division',
      'regiment',
      'column',
      'detachment',
      'unknown',
    ])
    expect(organizationTimePrecisions).toEqual([
      'T0',
      'T1',
      'T2',
      'T3',
      'T4',
      'T5',
      'T6',
      'TU',
    ])
  })
})

describe('organization field validation', () => {
  const requiredFields = [
    'organization_id',
    'name',
    'organization_type',
    'echelon',
    'valid_from',
    'valid_to',
    'time_precision',
    'review_status',
    'created_at',
    'updated_at',
    'data_version',
  ] as const

  it.each(requiredFields)('rejects a missing required field: %s', (field) => {
    const candidate = { ...organizationFixture() } as Record<string, unknown>
    delete candidate[field]
    const result = validate([candidate])
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field,
        error_code: 'MISSING_REQUIRED_FIELD',
      }),
    )
  })

  it('allows description to be omitted or null', () => {
    const omitted = {
      ...organizationFixture({
        time_precision: 'T1',
        valid_from: '1934-10-01',
        valid_to: '1934-10-01',
      }),
    } as Record<string, unknown>
    delete omitted.description
    expect(validate([omitted]).errors).toEqual([])
    expect(
      validate([
        organizationFixture({
          description: null,
          time_precision: 'T1',
          valid_from: '1934-10-01',
          valid_to: '1934-10-01',
        }),
      ]).errors,
    ).toEqual([])
  })

  it('rejects null or blank required values and a missing nullable field', () => {
    expect(
      errorCodes(validate([organizationFixture({ name: ' ' })])),
    ).toContain('INVALID_NAME')
    expect(
      errorCodes(
        validate([
          organizationFixture({
            organization_type:
              null as unknown as Organization['organization_type'],
          }),
        ]),
      ),
    ).toContain('INVALID_ORGANIZATION_TYPE')

    const missingNullable = {
      ...organizationFixture(),
    } as Record<string, unknown>
    delete missingNullable.valid_from
    expect(errorCodes(validate([missingNullable]))).toContain(
      'MISSING_REQUIRED_FIELD',
    )
  })

  it('rejects invalid IDs and duplicate IDs without overwriting the first record', () => {
    const duplicate = organizationFixture({ organization_id: 'org_duplicate' })
    const result = validate([
      organizationFixture({ organization_id: 'bad-id' }),
      duplicate,
      { ...duplicate },
    ])
    expect(errorCodes(result)).toEqual(
      expect.arrayContaining([
        'INVALID_ORGANIZATION_ID',
        'DUPLICATE_ORGANIZATION_ID',
      ]),
    )
    expect(result.organizations.map((item) => item.organization_id)).toEqual([
      'org_duplicate',
    ])
  })

  it('rejects invalid enums and requires an echelon for military organizations', () => {
    expect(
      errorCodes(
        validate([
          organizationFixture({
            organization_type:
              'army' as unknown as Organization['organization_type'],
          }),
        ]),
      ),
    ).toContain('INVALID_ORGANIZATION_TYPE')
    expect(
      errorCodes(
        validate([
          organizationFixture({
            echelon: 'brigade' as unknown as Organization['echelon'],
          }),
        ]),
      ),
    ).toContain('INVALID_ECHELON')
    expect(
      errorCodes(validate([organizationFixture({ echelon: null })])),
    ).toContain('MILITARY_ECHELON_REQUIRED')
    expect(
      errorCodes(
        validate([
          organizationFixture({
            time_precision: 'TX' as unknown as Organization['time_precision'],
          }),
        ]),
      ),
    ).toContain('INVALID_TIME_PRECISION')
  })

  it.each([
    'sourced',
    'first_review',
    'second_review',
    'published',
    'needs_revision',
    'withheld',
    'withdrawn',
  ])('rejects non-draft review status %s', (reviewStatus) => {
    const result = validate([
      organizationFixture({
        review_status: reviewStatus as unknown as Organization['review_status'],
      }),
    ])
    expect(errorCodes(result)).toContain('INVALID_REVIEW_STATUS')
  })

  it.each([
    'org_name',
    'organization_name',
    'status',
    'confidence',
    'parent_id',
    'route_ids',
    'member_ids',
    'dataset_tier',
    'is_sample',
    'publication_allowed',
    'sequence_only',
    'unknown_business_field',
  ])('rejects prohibited or unknown field %s', (field) => {
    const candidate = { ...organizationFixture(), [field]: 'invalid' }
    const result = validate([candidate])
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field,
        error_code: 'UNKNOWN_OR_PROHIBITED_FIELD',
      }),
    )
  })

  it('validates common timestamps and manifest data version equality', () => {
    expect(
      errorCodes(validate([organizationFixture({ created_at: 'not-a-date' })])),
    ).toContain('INVALID_CREATED_AT')
    expect(
      errorCodes(validate([organizationFixture({ updated_at: 'not-a-date' })])),
    ).toContain('INVALID_UPDATED_AT')
    expect(
      errorCodes(
        validate([
          organizationFixture({
            created_at: '2026-07-23T00:00:00.000Z',
            updated_at: '2026-07-22T00:00:00.000Z',
          }),
        ]),
      ),
    ).toContain('UPDATED_BEFORE_CREATED')
    expect(
      errorCodes(
        validate([organizationFixture({ data_version: 'v0.1-other' })]),
      ),
    ).toContain('DATA_VERSION_MISMATCH')
  })
})

describe('organization time contract', () => {
  it.each([
    ['T1', '1934-10-01', '1934-10-01'],
    ['T2', '1934-10-01', '1934-10-10'],
    ['T2', '1934-10-11', '1934-10-20'],
    ['T2', '1936-02-21', '1936-02-29'],
    ['T3', '1936-02-01', '1936-02-29'],
    ['T4', '1934-10-01', '1935-01-10'],
    ['T5', '1934-01-01', '1934-12-31'],
  ] as const)('accepts valid %s date boundaries', (precision, start, end) => {
    const result = validate([
      organizationFixture({
        time_precision: precision,
        valid_from: start,
        valid_to: end,
      }),
    ])
    expect(result.errors).toEqual([])
  })

  it('accepts TU only with two null dates and an explicit pending note', () => {
    expect(validate().errors).toEqual([])
    expect(
      errorCodes(
        validate([
          organizationFixture({
            valid_from: '1934-10-01',
            valid_to: '1934-10-01',
          }),
        ]),
      ),
    ).toContain('INVALID_TIME_COMBINATION')
    expect(
      errorCodes(validate([organizationFixture({ description: null })])),
    ).toContain('TU_DESCRIPTION_REQUIRED')
  })

  it('rejects invalid dates, reversed ranges, missing dates and wrong boundaries', () => {
    expect(
      errorCodes(
        validate([
          organizationFixture({
            time_precision: 'T1',
            valid_from: '1934-02-30',
            valid_to: '1934-02-30',
          }),
        ]),
      ),
    ).toContain('INVALID_DATE_FORMAT')
    expect(
      errorCodes(
        validate([
          organizationFixture({
            time_precision: 'T4',
            valid_from: '1934-10-02',
            valid_to: '1934-10-01',
          }),
        ]),
      ),
    ).toContain('REVERSED_DATE_RANGE')
    expect(
      errorCodes(
        validate([
          organizationFixture({
            time_precision: 'T3',
            valid_from: null,
            valid_to: null,
          }),
        ]),
      ),
    ).toContain('INVALID_TIME_COMBINATION')
    expect(
      errorCodes(
        validate([
          organizationFixture({
            time_precision: 'T2',
            valid_from: '1934-10-02',
            valid_to: '1934-10-10',
          }),
        ]),
      ),
    ).toContain('INVALID_TIME_COMBINATION')
  })

  it('explicitly rejects T0 and T6 without extending the frozen fields', () => {
    const t0 = validate([organizationFixture({ time_precision: 'T0' })])
    const t6 = validate([organizationFixture({ time_precision: 'T6' })])
    expect(errorCodes(t0)).toContain(
      'T0_NOT_REPRESENTABLE_BY_ORGANIZATION_CONTRACT',
    )
    expect(errorCodes(t6)).toContain(
      'T6_NOT_REPRESENTABLE_BY_ORGANIZATION_CONTRACT',
    )
    expect(t6.errors[0].message).toContain('sequence_only')
  })
})

describe('organization manifest and foreign-key registry', () => {
  it.each([
    ['dataset_tier', 'preview'],
    ['is_sample', false],
    ['review_status', 'published'],
    ['publication_allowed', true],
  ])('rejects an invalid manifest field %s', (field, value) => {
    const result = validate([organizationFixture()], {
      ...manifest(),
      [field]: value,
    })
    expect(errorCodes(result)).toContain('INVALID_SAMPLE_MANIFEST')
  })

  it('rejects a published path and unknown manifest fields', () => {
    const result = validate(
      [organizationFixture()],
      { ...manifest(), product_version: '1.0' },
      'data-published/t06-pre-organizations',
    )
    expect(errorCodes(result)).toEqual(
      expect.arrayContaining([
        'SAMPLE_IN_PUBLISHED_DIRECTORY',
        'UNKNOWN_MANIFEST_FIELD',
      ]),
    )
  })

  it('finds only an exact validated ID and never falls back or fuzzy matches', () => {
    const registry = loaded.registry
    expect(registry.size).toBe(2)
    expect(registry.findById('org_central_red_army')?.name).toBe('中央红军')
    expect(registry.findById('中央红军')).toBeUndefined()
    expect(registry.findById('org_central_red')).toBeUndefined()
    expect(registry.findById('org_missing')).toBeUndefined()
  })

  it('returns a complete structured foreign-key error for an unknown ID', () => {
    const result = loaded.registry.require('org_missing', {
      file: 'route-segments.json',
      recordId: 'seg_fixture',
    })
    expect(result).toEqual({
      ok: false,
      error: {
        file: 'route-segments.json',
        record_id: 'seg_fixture',
        field: 'organization_id',
        error_code: 'ORGANIZATION_NOT_FOUND',
        message:
          'organization_id org_missing未引用当前合法组织注册表中的记录。',
      },
    })
  })

  it('returns an immutable validated record and never auto-creates missing IDs', () => {
    const organization = loaded.registry.findById('org_central_red_army')
    expect(organization).toBeDefined()
    expect(Object.isFrozen(organization)).toBe(true)
    expect(
      loaded.registry.require('org_missing', {
        file: 'routes.json',
        recordId: 'route_fixture',
      }).ok,
    ).toBe(false)
    expect(loaded.registry.size).toBe(2)
    expect(loaded.registry.findById('org_missing')).toBeUndefined()
  })

  it('isolates invalid rows instead of adding them to the registry', () => {
    const result = validate([
      organizationFixture({ organization_id: 'bad-id' }),
      organizationFixture({ organization_id: 'org_valid' }),
    ])
    expect(result.ok).toBe(false)
    expect(result.registry.size).toBe(1)
    expect(result.registry.findById('bad-id')).toBeUndefined()
    expect(result.registry.findById('org_valid')).toBeDefined()
    expect(result.errors[0]).toEqual(
      expect.objectContaining({
        file: expect.any(String),
        record_id: 'bad-id',
        field: 'organization_id',
        error_code: 'INVALID_ORGANIZATION_ID',
        message: expect.any(String),
      }),
    )
  })
})
