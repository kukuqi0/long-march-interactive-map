import { describe, expect, it } from 'vitest'
import geometriesText from '../sample-draft/t06-routes/route-geometries.geojson?raw'
import manifestJson from '../sample-draft/t06-routes/manifest.json'
import routeSegmentsJson from '../sample-draft/t06-routes/route-segments.json'
import routesJson from '../sample-draft/t06-routes/routes.json'
import { loadT06PreOrganizationDataset } from './loadOrganizations'
import { loadT04PlaceDataset } from './loadPlaces'
import { loadT06RouteDataset, validateRouteDataset } from './loadRoutes'
import type { Route, RouteSegment } from '../../types/route'

const places = loadT04PlaceDataset()
const organizations = loadT06PreOrganizationDataset()
const loaded = loadT06RouteDataset(places, organizations)

function clone<T>(value: T): T {
  return structuredClone(value)
}

function input() {
  return {
    manifest: clone(manifestJson),
    routes: clone(routesJson) as unknown[],
    routeSegments: clone(routeSegmentsJson) as unknown[],
    geometries: JSON.parse(geometriesText) as {
      type: string
      features: Array<Record<string, unknown>>
    },
  }
}

function validate(candidate = input(), datasetPath?: string) {
  return validateRouteDataset(
    { ...candidate, datasetPath },
    places,
    organizations,
  )
}

function codes(result: ReturnType<typeof validate>) {
  return result.errors.map((error) => error.error_code)
}

function firstRoute(overrides: Partial<Route> = {}) {
  return { ...(clone(routesJson[0]) as Route), ...overrides }
}

function firstSegment(overrides: Partial<RouteSegment> = {}) {
  return { ...(clone(routeSegmentsJson[0]) as RouteSegment), ...overrides }
}

describe('route data loader', () => {
  it('loads two routes and eight independently reviewed route segments', () => {
    expect(loaded.ok).toBe(true)
    expect(loaded.errors).toEqual([])
    expect(loaded.routes).toHaveLength(2)
    expect(loaded.routeSegments).toHaveLength(8)
    expect(
      loaded.routes.every((route) => route.review_status === 'draft'),
    ).toBe(true)
    expect(
      loaded.routeSegments.every(
        (segment) => segment.review_status === 'draft',
      ),
    ).toBe(true)
    expect(loaded.manifest).toMatchObject({
      dataset_tier: 'sample-draft',
      is_sample: true,
      publication_allowed: false,
      review_status: 'draft',
    })
  })

  it('covers every R1—RU branch without geometry for R5 or RU', () => {
    expect(
      new Set(loaded.routeSegments.map((segment) => segment.route_certainty)),
    ).toEqual(new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'RU']))
    expect(loaded.featureCollection.features).toHaveLength(7)
    expect(loaded.unmapped.map((item) => item.route_segment_id)).toEqual([
      'seg_t06_r5_placeholder',
      'seg_t06_ru_placeholder',
    ])
    expect(
      loaded.featureCollection.features.some((feature) =>
        ['seg_t06_r5_placeholder', 'seg_t06_ru_placeholder'].includes(
          feature.properties.route_segment_id,
        ),
      ),
    ).toBe(false)
  })

  it('keeps R4 alternatives separate and R3 as a polygon corridor', () => {
    const r4 = loaded.featureCollection.features.filter(
      (feature) => feature.properties.route_certainty === 'R4',
    )
    expect(r4).toHaveLength(2)
    expect(r4.map((feature) => feature.properties.alternative_id)).toEqual([
      'A',
      'B',
    ])
    expect(r4[0].geometry).not.toEqual(r4[1].geometry)
    expect(
      loaded.featureCollection.features.find(
        (feature) => feature.properties.route_certainty === 'R3',
      )?.geometry.type,
    ).toBe('Polygon')
  })

  it('preserves explicit gaps instead of merging by sequence or endpoints', () => {
    const features = loaded.featureCollection.features
    expect(features.map((feature) => feature.id)).not.toContain(
      'seg_t06_r5_placeholder',
    )
    const beforeGap = features.find(
      (feature) =>
        feature.properties.route_segment_id === 'seg_t06_r2_placeholder',
    )
    const afterGap = features.find(
      (feature) =>
        feature.properties.route_segment_id ===
        'seg_t06_r1_after_gap_placeholder',
    )
    expect(beforeGap?.geometry).not.toEqual(afterGap?.geometry)
    expect(
      features.filter(
        (feature) =>
          feature.properties.route_id === 'route_t06_main_placeholder',
      ),
    ).toHaveLength(5)
  })
})

describe('route organization foreign keys', () => {
  it('validates every route and segment through the existing registry', () => {
    expect(organizations.registry.size).toBe(2)
    expect(
      loaded.routes.every(
        (route) =>
          organizations.registry.require(route.organization_id, {
            file: 'routes.json',
            recordId: route.route_id,
          }).ok,
      ),
    ).toBe(true)
    expect(
      loaded.routeSegments.every(
        (segment) =>
          organizations.registry.require(segment.organization_id, {
            file: 'route-segments.json',
            recordId: segment.route_segment_id,
          }).ok,
      ),
    ).toBe(true)
  })

  it('rejects an unknown route organization even with an org_ prefix', () => {
    const candidate = input()
    candidate.routes = [firstRoute({ organization_id: 'org_missing' })]
    candidate.routeSegments = []
    candidate.geometries.features = []
    const result = validate(candidate)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: expect.stringContaining('routes.json'),
        record_id: 'route_t06_main_placeholder',
        field: 'organization_id',
        error_code: 'ORGANIZATION_NOT_FOUND',
      }),
    )
  })

  it('rejects an unknown segment organization and identifies the caller file', () => {
    const candidate = input()
    candidate.routeSegments = [
      firstSegment({ organization_id: 'org_unknown_but_prefixed' }),
    ]
    candidate.geometries.features = [candidate.geometries.features[0]]
    const result = validate(candidate)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: expect.stringContaining('route-segments.json'),
        record_id: 'seg_t06_r1_placeholder',
        field: 'organization_id',
        error_code: 'ORGANIZATION_NOT_FOUND',
        message: expect.stringContaining('未引用当前合法组织注册表'),
      }),
    )
  })

  it('does not mutate or auto-create organization records after route failures', () => {
    const before = JSON.stringify(organizations.organizations)
    const candidate = input()
    candidate.routes = [firstRoute({ organization_id: 'org_missing' })]
    candidate.routeSegments = []
    candidate.geometries.features = []
    validate(candidate)
    expect(JSON.stringify(organizations.organizations)).toBe(before)
    expect(organizations.registry.size).toBe(2)
    expect(organizations.registry.findById('org_missing')).toBeUndefined()
    expect(
      organizations.registry.findById('org_central_red_army')?.review_status,
    ).toBe('draft')
  })
})

describe('route and segment contract validation', () => {
  it('isolates invalid route IDs, duplicate IDs and unknown topics', () => {
    const candidate = input()
    candidate.routes = [
      firstRoute({ route_id: 'bad-id' }),
      firstRoute(),
      firstRoute(),
      firstRoute({
        route_id: 'route_unknown_topic',
        topic_id: 'topic_missing',
      }),
    ]
    candidate.routeSegments = []
    candidate.geometries.features = []
    expect(codes(validate(candidate))).toEqual(
      expect.arrayContaining([
        'INVALID_ROUTE_ID',
        'DUPLICATE_ROUTE_ID',
        'UNKNOWN_TOPIC_REFERENCE',
      ]),
    )
  })

  it('rejects missing fields, prohibited aliases, invalid role and non-draft routes', () => {
    const candidate = input()
    const route = {
      ...firstRoute({
        route_role: 'primary' as Route['route_role'],
        review_status: 'published' as Route['review_status'],
      }),
      name: 'forbidden',
    } as Record<string, unknown>
    delete route.title
    candidate.routes = [route]
    candidate.routeSegments = []
    candidate.geometries.features = []
    expect(codes(validate(candidate))).toEqual(
      expect.arrayContaining([
        'MISSING_REQUIRED_FIELD',
        'PROHIBITED_ROUTE_FIELD',
        'INVALID_ROUTE_ROLE',
        'INVALID_REVIEW_STATUS',
      ]),
    )
  })

  it('rejects invalid segment IDs, route/place references and sequence numbers', () => {
    const candidate = input()
    candidate.routeSegments = [
      firstSegment({
        route_segment_id: 'bad-id',
        route_id: 'route_missing',
        sequence_no: 0,
        from_place_id: 'place_missing',
        to_place_id: 'place_missing_too',
      }),
    ]
    candidate.geometries.features = []
    expect(codes(validate(candidate))).toEqual(
      expect.arrayContaining([
        'INVALID_ROUTE_SEGMENT_ID',
        'UNKNOWN_ROUTE_REFERENCE',
        'INVALID_SEQUENCE_NO',
        'UNKNOWN_PLACE_REFERENCE',
      ]),
    )
  })

  it('rejects duplicate segment IDs and duplicate sequences per route only', () => {
    const candidate = input()
    const first = firstSegment()
    const duplicate = { ...first }
    candidate.routeSegments = [first, duplicate]
    candidate.geometries.features = [candidate.geometries.features[0]]
    expect(codes(validate(candidate))).toEqual(
      expect.arrayContaining([
        'DUPLICATE_ROUTE_SEGMENT_ID',
        'DUPLICATE_ROUTE_SEQUENCE',
      ]),
    )

    const otherRoute = clone(routeSegmentsJson[5]) as RouteSegment
    otherRoute.route_segment_id = 'seg_other_route_sequence_one'
    const separate = input()
    separate.routeSegments = [first, otherRoute]
    separate.geometries.features = [
      separate.geometries.features[0],
      separate.geometries.features[5],
    ]
    expect(codes(validate(separate))).not.toContain('DUPLICATE_ROUTE_SEQUENCE')
  })

  it('rejects prohibited segment fields, bad enums and non-draft records', () => {
    const candidate = input()
    const segment = {
      ...firstSegment({
        movement_type: 'walk' as RouteSegment['movement_type'],
        route_certainty: 'RX' as RouteSegment['route_certainty'],
        review_status: 'published' as RouteSegment['review_status'],
      }),
      title: 'forbidden',
      sequence_only: true,
    }
    candidate.routeSegments = [segment]
    candidate.geometries.features = []
    expect(codes(validate(candidate))).toEqual(
      expect.arrayContaining([
        'PROHIBITED_ROUTE_SEGMENT_FIELD',
        'INVALID_MOVEMENT_TYPE',
        'INVALID_ROUTE_CERTAINTY',
        'INVALID_REVIEW_STATUS',
      ]),
    )
  })

  it('rejects published paths and permissive manifests', () => {
    const candidate = input()
    candidate.manifest = { ...manifestJson, publication_allowed: true }
    expect(codes(validate(candidate, 'data-published/t06-routes'))).toEqual(
      expect.arrayContaining([
        'INVALID_SAMPLE_MANIFEST',
        'SAMPLE_IN_PUBLISHED_DIRECTORY',
      ]),
    )
  })
})

describe('route time precision validation', () => {
  it.each([
    ['T1', '1934-10-01', '1934-10-01'],
    ['T2', '1934-10-11', '1934-10-20'],
    ['T3', '1936-02-01', '1936-02-29'],
    ['T4', '1934-10-01', '1934-11-08'],
  ] as const)('accepts valid %s boundaries', (precision, start, end) => {
    const candidate = input()
    candidate.routeSegments = [
      firstSegment({
        time_precision: precision,
        time_start: start,
        time_end: end,
      }),
    ]
    candidate.geometries.features = [candidate.geometries.features[0]]
    expect(codes(validate(candidate))).not.toContain('INVALID_TIME_COMBINATION')
  })

  it.each(['T6', 'TU'] as const)(
    'requires %s to use two null dates',
    (precision) => {
      const candidate = input()
      candidate.routeSegments = [
        firstSegment({
          time_precision: precision,
          time_start: '1934-10-01',
          time_end: '1934-10-01',
        }),
      ]
      candidate.geometries.features = [candidate.geometries.features[0]]
      expect(codes(validate(candidate))).toContain('INVALID_TIME_COMBINATION')
    },
  )

  it('rejects T0, false dates, reversed ranges and missing T1 dates', () => {
    for (const [overrides, expected] of [
      [{ time_precision: 'T0' }, 'T0_NOT_REPRESENTABLE_BY_DATE_CONTRACT'],
      [
        { time_start: '1934-02-30', time_end: '1934-02-30' },
        'INVALID_DATE_FORMAT',
      ],
      [
        {
          time_precision: 'T4',
          time_start: '1934-10-02',
          time_end: '1934-10-01',
        },
        'REVERSED_TIME_RANGE',
      ],
      [
        { time_precision: 'T1', time_start: null, time_end: null },
        'INVALID_TIME_COMBINATION',
      ],
    ] as const) {
      const candidate = input()
      candidate.routeSegments = [
        firstSegment(overrides as Partial<RouteSegment>),
      ]
      candidate.geometries.features = [candidate.geometries.features[0]]
      expect(codes(validate(candidate))).toContain(expected)
    }
  })
})

describe('route certainty and GeoJSON validation', () => {
  it('rejects geometry on R5 and RU and does not auto-fix the records', () => {
    for (const certainty of ['R5', 'RU'] as const) {
      const candidate = input()
      candidate.routeSegments = [
        firstSegment({
          route_certainty: certainty,
          spatial_precision: certainty === 'RU' ? 'SU' : 'S5',
          geometry_ref: 'geom_t06_r1_placeholder',
          geometry_method: certainty === 'RU' ? 'none' : 'direction_only',
          uncertainty_note: '资料不足，禁止连接。',
        }),
      ]
      candidate.geometries.features = [candidate.geometries.features[0]]
      const result = validate(candidate)
      expect(codes(result)).toContain('UNKNOWN_ROUTE_GEOMETRY_FORBIDDEN')
      expect(result.featureCollection.features).toHaveLength(0)
    }
  })

  it('rejects incompatible certainty, method, precision and R3 line geometry', () => {
    const candidate = input()
    candidate.routeSegments = [
      firstSegment({
        route_certainty: 'R3',
        spatial_precision: 'S1',
        geometry_method: 'source_trace',
        uncertainty_note: '大致通道占位。',
      }),
    ]
    candidate.geometries.features = [candidate.geometries.features[0]]
    expect(codes(validate(candidate))).toEqual(
      expect.arrayContaining([
        'INVALID_CERTAINTY_METHOD',
        'INVALID_CERTAINTY_SPATIAL_PRECISION',
        'R3_REQUIRES_CORRIDOR_POLYGON',
      ]),
    )
  })

  it('rejects R4 with only one or merged alternative', () => {
    const candidate = input()
    candidate.routeSegments = [clone(routeSegmentsJson[3]) as RouteSegment]
    candidate.geometries.features = [
      {
        ...candidate.geometries.features[2],
        properties: {
          geometry_ref: 'geom_t06_r4_placeholder',
          route_segment_id: 'seg_t06_r4_placeholder',
          alternative_id: null,
          alternative_label: null,
        },
      },
    ]
    expect(codes(validate(candidate))).toContain(
      'R4_REQUIRES_SEPARATE_ALTERNATIVES',
    )
  })

  it('rejects missing, non-unique and orphan geometry references', () => {
    const missing = input()
    missing.routeSegments = [firstSegment({ geometry_ref: 'geom_missing' })]
    missing.geometries.features = []
    expect(codes(validate(missing))).toContain('GEOMETRY_REFERENCE_NOT_FOUND')

    const duplicate = input()
    duplicate.routeSegments = [firstSegment()]
    duplicate.geometries.features = [
      duplicate.geometries.features[0],
      {
        ...clone(duplicate.geometries.features[0]),
        id: 'feature_t06_duplicate_ref',
      },
    ]
    expect(codes(validate(duplicate))).toContain('NON_R4_GEOMETRY_NOT_UNIQUE')

    const orphan = input()
    orphan.routeSegments = []
    orphan.geometries.features = [orphan.geometries.features[0]]
    expect(codes(validate(orphan))).toContain('ORPHAN_ROUTE_GEOMETRY')
  })

  it('rejects too-short, identical, out-of-range and non-finite LineStrings', () => {
    const cases = [
      { coordinates: [[100, 30]], code: 'LINESTRING_TOO_SHORT' },
      {
        coordinates: [
          [100, 30],
          [100, 30],
        ],
        code: 'LINESTRING_IDENTICAL_POINTS',
      },
      {
        coordinates: [
          [181, 30],
          [100, 30],
        ],
        code: 'INVALID_LONGITUDE',
      },
      {
        coordinates: [
          [35, 104],
          [100, 30],
        ],
        code: 'INVALID_LATITUDE',
      },
      {
        coordinates: [
          [Number.POSITIVE_INFINITY, 30],
          [100, 30],
        ],
        code: 'INVALID_LONGITUDE',
      },
    ]
    for (const testCase of cases) {
      const candidate = input()
      candidate.routeSegments = [firstSegment()]
      candidate.geometries.features = [
        {
          ...candidate.geometries.features[0],
          geometry: { type: 'LineString', coordinates: testCase.coordinates },
        },
      ]
      expect(codes(validate(candidate))).toContain(testCase.code)
    }
  })
})
