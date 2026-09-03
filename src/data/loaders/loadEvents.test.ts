import { describe, expect, it } from 'vitest'
import {
  eventTypes,
  timePrecisions,
  type HistoricalEvent,
} from '../../types/event'
import { spatialPrecisions } from '../../types/place'
import { loadT04PlaceDataset } from './loadPlaces'
import { loadT05EventDataset, validateEventDataset } from './loadEvents'

const placeDataset = loadT04PlaceDataset()
const loaded = loadT05EventDataset(placeDataset)

function manifest() {
  return {
    dataset_tier: 'sample-draft',
    is_sample: true,
    publication_allowed: false,
    review_status: 'draft',
    data_version: 'v0.1-t05-sample-draft',
    content_note: '结构测试/待核验占位数据，不代表已核验长征史实',
  }
}

function eventFixture(overrides: Partial<HistoricalEvent> = {}) {
  return {
    ...loaded.events[0],
    event_id: 'event_fixture',
    ...overrides,
  }
}

function validateOne(overrides: Partial<HistoricalEvent> = {}) {
  return validateEventDataset(
    { manifest: manifest(), events: [eventFixture(overrides)] },
    placeDataset,
  )
}

function errorCodes(result: ReturnType<typeof validateOne>) {
  return result.errors.map((error) => error.error_code)
}

describe('event data loader', () => {
  it('loads nine draft placeholders and all frozen event types', () => {
    expect(loaded.ok).toBe(true)
    expect(loaded.events).toHaveLength(10)
    expect(new Set(loaded.events.map((event) => event.event_type))).toEqual(
      new Set(eventTypes),
    )
    expect(
      loaded.events.every((event) => event.review_status === 'draft'),
    ).toBe(true)
    expect(loaded.manifest).toMatchObject({
      dataset_tier: 'sample-draft',
      is_sample: true,
      publication_allowed: false,
      review_status: 'draft',
    })
  })

  it('maps only events backed by validated point geometry', () => {
    expect(loaded.featureCollection.features).toHaveLength(6)
    expect(loaded.unmapped).toHaveLength(4)
    expect(
      loaded.featureCollection.features.every((feature) =>
        placeDataset.featureCollection.features.some(
          (place) =>
            place.properties.place_id === feature.properties.place_id &&
            place.geometry === feature.geometry,
        ),
      ),
    ).toBe(true)
  })

  it('keeps event records free of coordinate and alias fields', () => {
    for (const event of loaded.events) {
      expect(event).not.toHaveProperty('lat')
      expect(event).not.toHaveProperty('lng')
      expect(event).not.toHaveProperty('date')
      expect(event).not.toHaveProperty('name')
      expect(event).not.toHaveProperty('status')
    }
  })

  it.each(eventTypes)('recognizes event_type %s', (eventType) => {
    const result = validateOne({ event_type: eventType })
    expect(errorCodes(result)).not.toContain('INVALID_EVENT_TYPE')
  })

  it('rejects bad and duplicate event IDs while isolating invalid rows', () => {
    const first = eventFixture({ event_id: 'bad-id' })
    const duplicate = eventFixture({ event_id: 'event_duplicate' })
    const result = validateEventDataset(
      {
        manifest: manifest(),
        events: [first, duplicate, { ...duplicate }],
      },
      placeDataset,
    )

    expect(errorCodes(result)).toEqual(
      expect.arrayContaining(['INVALID_EVENT_ID', 'DUPLICATE_EVENT_ID']),
    )
    expect(result.events.map((event) => event.event_id)).toEqual([
      'event_duplicate',
    ])
  })

  it('rejects a non-frozen topic ID and a prohibited alias field', () => {
    const candidate = {
      ...eventFixture({ topic_id: 'topic_other' }),
      date: '1934-10-02',
    }
    const result = validateEventDataset(
      { manifest: manifest(), events: [candidate] },
      placeDataset,
    )
    expect(errorCodes(result)).toEqual(
      expect.arrayContaining(['INVALID_TOPIC_ID', 'PROHIBITED_ALIAS_FIELD']),
    )
  })

  it('rejects empty original time text and non-draft review status', () => {
    const result = validateOne({
      time_original_text: ' ',
      review_status: 'published' as HistoricalEvent['review_status'],
    })
    expect(errorCodes(result)).toEqual(
      expect.arrayContaining([
        'EMPTY_TIME_ORIGINAL_TEXT',
        'INVALID_REVIEW_STATUS',
      ]),
    )
  })

  it('rejects a manifest that permits publication or a published path', () => {
    const result = validateEventDataset(
      {
        manifest: { ...manifest(), publication_allowed: true },
        events: [eventFixture()],
        datasetPath: 'data-published/t05-events',
      },
      placeDataset,
    )
    expect(errorCodes(result)).toEqual(
      expect.arrayContaining([
        'INVALID_SAMPLE_MANIFEST',
        'SAMPLE_IN_PUBLISHED_DIRECTORY',
      ]),
    )
  })
})

describe('event time precision validation', () => {
  it('recognizes every T0—TU enum', () => {
    expect(timePrecisions).toEqual([
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

  it('reports the frozen date-contract limitation for T0', () => {
    expect(
      errorCodes(
        validateOne({
          time_precision: 'T0',
          time_start: null,
          time_end: null,
        }),
      ),
    ).toContain('T0_NOT_REPRESENTABLE_BY_DATE_CONTRACT')
  })

  it.each([
    ['T1', '1934-10-02', '1934-10-02'],
    ['T2', '1934-10-11', '1934-10-20'],
    ['T2', '1936-02-21', '1936-02-29'],
    ['T3', '1936-02-01', '1936-02-29'],
    ['T4', '1934-10-02', '1934-10-08'],
    ['T5', '1934-01-01', '1934-12-31'],
  ] as const)(
    'accepts a valid %s date combination',
    (precision, start, end) => {
      const result = validateOne({
        time_precision: precision,
        time_start: start,
        time_end: end,
      })
      expect(errorCodes(result)).not.toContain('INVALID_TIME_COMBINATION')
    },
  )

  it.each(['T6', 'TU'] as const)(
    'accepts %s only with two null dates',
    (precision) => {
      const valid = validateOne({
        time_precision: precision,
        time_start: null,
        time_end: null,
      })
      const invalid = validateOne({
        time_precision: precision,
        time_start: '1934-10-02',
        time_end: '1934-10-02',
      })
      expect(errorCodes(valid)).not.toContain('INVALID_TIME_COMBINATION')
      expect(errorCodes(invalid)).toContain('INVALID_TIME_COMBINATION')
    },
  )

  it('rejects missing dates, false dates, reversed ranges and bad precision boundaries', () => {
    expect(
      errorCodes(validateOne({ time_start: null, time_end: null })),
    ).toContain('INVALID_TIME_COMBINATION')
    expect(
      errorCodes(
        validateOne({
          time_start: '1934-02-30',
          time_end: '1934-02-30',
        }),
      ),
    ).toContain('INVALID_DATE_FORMAT')
    expect(
      errorCodes(
        validateOne({
          time_precision: 'T4',
          time_start: '1934-10-08',
          time_end: '1934-10-02',
        }),
      ),
    ).toContain('REVERSED_TIME_RANGE')
    expect(
      errorCodes(
        validateOne({
          time_precision: 'T3',
          time_start: '1934-02-02',
          time_end: '1934-02-28',
        }),
      ),
    ).toContain('INVALID_TIME_COMBINATION')
  })
})

describe('event place linkage and spatial precision', () => {
  it('recognizes all S0—SU precision codes across the sample', () => {
    expect(spatialPrecisions).toEqual([
      'S0',
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
      'SU',
    ])
    expect(
      new Set(loaded.events.map((event) => event.spatial_precision)),
    ).toEqual(new Set(spatialPrecisions))
  })

  it('allows event precision equal to or lower than the linked place', () => {
    const result = validateOne({ spatial_precision: 'S1' })
    expect(errorCodes(result)).not.toContain('EVENT_PRECISION_EXCEEDS_PLACE')
  })

  it('rejects event precision that exceeds its place precision', () => {
    const result = validateOne({
      place_id: 'place_t04_s1_placeholder',
      spatial_precision: 'S0',
    })
    expect(errorCodes(result)).toContain('EVENT_PRECISION_EXCEEDS_PLACE')
  })

  it('rejects an unknown place and a non-SU null place', () => {
    expect(errorCodes(validateOne({ place_id: 'place_missing' }))).toContain(
      'UNKNOWN_PLACE_REFERENCE',
    )
    expect(errorCodes(validateOne({ place_id: null }))).toContain(
      'MISSING_PLACE_REFERENCE',
    )
  })

  it('requires SU to have no place and never creates an SU feature', () => {
    const valid = validateOne({
      place_id: null,
      spatial_precision: 'SU',
    })
    const invalid = validateOne({ spatial_precision: 'SU' })
    expect(valid.events).toHaveLength(1)
    expect(valid.featureCollection.features).toHaveLength(0)
    expect(valid.unmapped[0].reason).toContain('SU')
    expect(errorCodes(invalid)).toContain('SU_EVENT_HAS_PLACE')
  })

  it.each([
    ['place_t04_s3_placeholder', 'S3'],
    ['place_t04_s4_placeholder', 'S4'],
    ['place_t04_s5_placeholder', 'S5'],
  ] as const)('keeps %s as a valid list-only event', (placeId, precision) => {
    const result = validateOne({
      place_id: placeId,
      spatial_precision: precision,
    })
    expect(result.events).toHaveLength(1)
    expect(result.featureCollection.features).toHaveLength(0)
    expect(result.unmapped).toHaveLength(1)
  })
})
