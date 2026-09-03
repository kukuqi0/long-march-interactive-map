import { describe, expect, it } from 'vitest'
import { loadT04PlaceDataset, validatePlaceDataset } from './loadPlaces'
import type { PlaceDatasetInput } from '../../types/place'

function validInput(): PlaceDatasetInput {
  return {
    manifest: {
      dataset_tier: 'sample-draft',
      is_sample: true,
      publication_allowed: false,
      review_status: 'draft',
      data_version: 'v0.1-t04-sample-draft',
      content_note: '结构测试数据/待核验占位数据，不得作为正式史实引用',
    },
    places: [
      {
        place_id: 'place_valid',
        modern_reference_name: null,
        geometry_type: 'point',
        geometry_ref: 'geom_valid',
        spatial_precision: 'S1',
        match_status: 'probable',
        match_note: '结构测试占位坐标，待核验。',
        review_status: 'draft',
        created_at: '2026-07-17T00:00:00.000Z',
        updated_at: '2026-07-17T00:00:00.000Z',
        data_version: 'v0.1-t04-sample-draft',
      },
    ],
    historicalNames: [
      {
        historical_name_id: 'hname_valid',
        place_id: 'place_valid',
        name: '结构测试历史名（待核验）',
        name_type: 'common',
        valid_from: null,
        valid_to: null,
        claim_id: 'claim_placeholder',
        created_at: '2026-07-17T00:00:00.000Z',
        updated_at: '2026-07-17T00:00:00.000Z',
        data_version: 'v0.1-t04-sample-draft',
      },
    ],
    geometries: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'geom_valid',
          properties: { place_id: 'place_valid' },
          geometry: { type: 'Point', coordinates: [104, 35] },
        },
      ],
    },
  }
}

function cloneInput() {
  return structuredClone(validInput())
}

function firstPlace(input: PlaceDatasetInput) {
  return (input.places as Record<string, unknown>[])[0]
}

function firstName(input: PlaceDatasetInput) {
  return (input.historicalNames as Record<string, unknown>[])[0]
}

function firstFeature(input: PlaceDatasetInput) {
  return (input.geometries as { features: Record<string, unknown>[] })
    .features[0]
}

function coordinates(input: PlaceDatasetInput) {
  return (firstFeature(input).geometry as { coordinates: unknown[] })
    .coordinates
}

describe('place data loader', () => {
  it('loads the repository sample as draft-only data covering S0 through SU', () => {
    const result = loadT04PlaceDataset()

    expect(result.ok).toBe(true)
    expect(result.places).toHaveLength(8)
    expect(result.historicalNames).toHaveLength(10)
    expect(result.featureCollection.features).toHaveLength(4)
    expect(result.unmapped).toHaveLength(4)
    expect(
      new Set(result.places.map((place) => place.spatial_precision)),
    ).toEqual(new Set(['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'SU']))
    expect(
      result.places.every((place) => place.review_status === 'draft'),
    ).toBe(true)
    expect(result.manifest).toMatchObject({
      dataset_tier: 'sample-draft',
      is_sample: true,
      publication_allowed: false,
      review_status: 'draft',
    })
    expect(result.warnings).toHaveLength(10)
    expect(result.warnings[0]).toMatchObject({
      field: 'claim_id',
      error_code: 'claim_foreign_key_not_checked',
    })
  })

  it('accepts a valid place, historical name and WGS84 Point', () => {
    const result = validatePlaceDataset(validInput())

    expect(result.ok).toBe(true)
    expect(result.featureCollection.features[0]).toMatchObject({
      id: 'geom_valid',
      properties: {
        place_id: 'place_valid',
        display_name: '结构测试历史名（待核验）',
      },
      geometry: { coordinates: [104, 35] },
    })
  })

  it.each([
    ['bad place ID', 'place_id', 'bad-id', 'invalid_place_id'],
    ['bad geometry enum', 'geometry_type', 'marker', 'invalid_geometry_type'],
    [
      'bad precision enum',
      'spatial_precision',
      'SX',
      'invalid_spatial_precision',
    ],
    ['bad match enum', 'match_status', 'maybe', 'invalid_match_status'],
    ['non-draft sample', 'review_status', 'published', 'sample_must_be_draft'],
  ])('rejects %s', (_label, field, value, errorCode) => {
    const input = cloneInput()
    firstPlace(input)[field] = value

    const result = validatePlaceDataset(input)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field, error_code: errorCode }),
      ]),
    )
    expect(result.featureCollection.features).toHaveLength(0)
  })

  it('requires a match note for probable and disputed records', () => {
    const input = cloneInput()
    firstPlace(input).match_note = null

    const result = validatePlaceDataset(input)

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          record_id: 'place_valid',
          field: 'match_note',
          error_code: 'match_note_required',
        }),
      ]),
    )
  })

  it.each([
    [
      'bad historical ID',
      'historical_name_id',
      'name_bad',
      'invalid_historical_name_id',
    ],
    [
      'missing place FK',
      'place_id',
      'place_missing',
      'missing_place_reference',
    ],
    ['bad name type', 'name_type', 'nickname', 'invalid_name_type'],
    ['bad claim prefix', 'claim_id', 'source_wrong', 'invalid_claim_id'],
  ])('rejects %s', (_label, field, value, errorCode) => {
    const input = cloneInput()
    firstName(input)[field] = value

    const result = validatePlaceDataset(input)

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field, error_code: errorCode }),
      ]),
    )
  })

  it('rejects a historical-name date range in reverse order', () => {
    const input = cloneInput()
    firstName(input).valid_from = '1936-01-02'
    firstName(input).valid_to = '1936-01-01'

    const result = validatePlaceDataset(input)

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'valid_to',
          error_code: 'invalid_date_range',
        }),
      ]),
    )
  })

  it.each([
    ['dataset_tier', 'draft', 'invalid_sample_manifest'],
    ['is_sample', false, 'invalid_sample_manifest'],
    ['publication_allowed', true, 'invalid_sample_manifest'],
    ['review_status', 'second_review', 'invalid_sample_manifest'],
  ])('rejects an invalid manifest %s', (field, value, errorCode) => {
    const input = cloneInput()
    ;(input.manifest as Record<string, unknown>)[field] = value

    const result = validatePlaceDataset(input)

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field, error_code: errorCode }),
      ]),
    )
  })

  it('rejects sample data located in a published directory', () => {
    const input = cloneInput()
    input.datasetPath = 'src/data-published/t04-places'

    const result = validatePlaceDataset(input)

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'datasetPath',
          error_code: 'sample_in_published_directory',
        }),
      ]),
    )
  })

  it.each([
    ['longitude over range', 0, 181, 'invalid_longitude'],
    ['latitude over range', 1, 91, 'invalid_latitude'],
    ['string coordinate', 0, '104', 'invalid_longitude'],
    ['NaN coordinate', 0, Number.NaN, 'invalid_longitude'],
    ['Infinity coordinate', 1, Number.POSITIVE_INFINITY, 'invalid_latitude'],
    ['reversed test pair', 1, 190, 'invalid_latitude'],
  ])(
    'rejects %s without coordinate repair',
    (_label, index, value, errorCode) => {
      const input = cloneInput()
      coordinates(input)[index as number] = value

      const result = validatePlaceDataset(input)

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ error_code: errorCode }),
        ]),
      )
      expect(result.featureCollection.features).toHaveLength(0)
    },
  )

  it('rejects an invalid coordinate dimension', () => {
    const input = cloneInput()
    ;(firstFeature(input).geometry as { coordinates: unknown[] }).coordinates =
      [104, 35, 0]

    expect(validatePlaceDataset(input).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error_code: 'invalid_coordinate_dimension' }),
      ]),
    )
  })

  it('rejects duplicate geometry IDs', () => {
    const input = cloneInput()
    const collection = input.geometries as { features: unknown[] }
    collection.features.push(structuredClone(collection.features[0]))

    expect(validatePlaceDataset(input).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error_code: 'duplicate_feature_id' }),
      ]),
    )
  })

  it('rejects missing and mismatched geometry references', () => {
    const missing = cloneInput()
    firstPlace(missing).geometry_ref = 'geom_missing'
    const mismatch = cloneInput()
    ;(firstFeature(mismatch).properties as Record<string, unknown>).place_id =
      'place_other'

    expect(validatePlaceDataset(missing).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error_code: 'missing_geometry_reference' }),
      ]),
    )
    expect(validatePlaceDataset(mismatch).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error_code: 'geometry_place_mismatch' }),
      ]),
    )
  })

  it.each([
    ['SU with geometry', 'SU', 'point', 'su_must_not_have_geometry'],
    ['none with ref', 'S1', 'none', 'none_must_not_have_geometry_ref'],
    ['unmatched Point', 'S1', 'point', 'unmatched_cannot_have_point'],
    ['S4 Point', 'S4', 'point', 'imprecise_area_cannot_be_point'],
    ['S5 Point', 'S5', 'point', 'imprecise_area_cannot_be_point'],
  ])('rejects %s', (_label, precision, geometryType, errorCode) => {
    const input = cloneInput()
    const place = firstPlace(input)
    place.spatial_precision = precision
    place.geometry_type = geometryType
    if (_label === 'unmatched Point') {
      place.match_status = 'unmatched'
    }

    expect(validatePlaceDataset(input).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ error_code: errorCode }),
      ]),
    )
  })

  it('requires representative-point wording for S2 and S3 Points', () => {
    const input = cloneInput()
    const place = firstPlace(input)
    place.spatial_precision = 'S2'
    place.match_note = '非精确位置，但未声明用途。'

    expect(validatePlaceDataset(input).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          error_code: 'representative_point_note_required',
        }),
      ]),
    )
  })

  it('keeps valid non-Point records as unmapped instead of deleting them', () => {
    const input = cloneInput()
    const place = firstPlace(input)
    place.geometry_type = 'polygon'
    place.geometry_ref = null
    place.spatial_precision = 'S3'

    const result = validatePlaceDataset(input)

    expect(result.ok).toBe(true)
    expect(result.places).toHaveLength(1)
    expect(result.featureCollection.features).toHaveLength(0)
    expect(result.unmapped).toEqual([
      expect.objectContaining({ place_id: 'place_valid' }),
    ])
  })
})
