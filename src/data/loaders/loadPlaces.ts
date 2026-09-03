import historicalNamesJson from '../sample-draft/t04-places/historical-place-names.json'
import manifestJson from '../sample-draft/t04-places/manifest.json'
import geometriesText from '../sample-draft/t04-places/place-geometries.geojson?raw'
import placesJson from '../sample-draft/t04-places/places.json'
import {
  geometryTypes,
  historicalNameTypes,
  matchStatuses,
  reviewStatuses,
  spatialPrecisions,
  type HistoricalPlaceName,
  type LoadedPlaceDataset,
  type Place,
  type PlaceDataIssue,
  type PlaceDatasetInput,
  type PlaceDatasetManifest,
  type RenderPlaceFeature,
  type SourceGeometryFeature,
} from '../../types/place'

const files = {
  manifest: 'manifest.json',
  places: 'places.json',
  historicalNames: 'historical-place-names.json',
  geometries: 'place-geometries.geojson',
} as const

const placeIdPattern = /^place_[a-z0-9][a-z0-9_-]*$/
const historicalNameIdPattern = /^hname_[a-z0-9][a-z0-9_-]*$/
const claimIdPattern = /^claim_[a-z0-9][a-z0-9_-]*$/
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === 'string' && allowed.includes(value)
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !Number.isNaN(Date.parse(value)) &&
    value.includes('T')
  )
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !isoDatePattern.test(value)) {
    return false
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value)
  )
}

function addIssue(
  target: PlaceDataIssue[],
  recordId: string,
  file: string,
  field: string,
  errorCode: string,
  message: string,
) {
  target.push({
    record_id: recordId,
    file,
    field,
    error_code: errorCode,
    message,
  })
}

function validateCommonFields(
  record: Record<string, unknown>,
  recordId: string,
  file: string,
  errors: PlaceDataIssue[],
) {
  if (!isIsoDateTime(record.created_at)) {
    addIssue(
      errors,
      recordId,
      file,
      'created_at',
      'invalid_datetime',
      'created_at必须是合法ISO 8601日期时间。',
    )
  }
  if (!isIsoDateTime(record.updated_at)) {
    addIssue(
      errors,
      recordId,
      file,
      'updated_at',
      'invalid_datetime',
      'updated_at必须是合法ISO 8601日期时间。',
    )
  }
  if (
    isIsoDateTime(record.created_at) &&
    isIsoDateTime(record.updated_at) &&
    Date.parse(record.updated_at) < Date.parse(record.created_at)
  ) {
    addIssue(
      errors,
      recordId,
      file,
      'updated_at',
      'updated_before_created',
      'updated_at不得早于created_at。',
    )
  }
  if (typeof record.data_version !== 'string' || !record.data_version.trim()) {
    addIssue(
      errors,
      recordId,
      file,
      'data_version',
      'invalid_data_version',
      'data_version必须是非空字符串。',
    )
  }
}

function validateManifest(value: unknown, errors: PlaceDataIssue[]) {
  if (!isRecord(value)) {
    addIssue(
      errors,
      'dataset_manifest',
      files.manifest,
      '$',
      'invalid_manifest',
      'manifest必须是对象。',
    )
    return null
  }

  const expected = {
    dataset_tier: 'sample-draft',
    is_sample: true,
    publication_allowed: false,
    review_status: 'draft',
  } as const

  for (const [field, required] of Object.entries(expected)) {
    if (value[field] !== required) {
      addIssue(
        errors,
        'dataset_manifest',
        files.manifest,
        field,
        'invalid_sample_manifest',
        `${field}必须为${String(required)}。`,
      )
    }
  }
  if (typeof value.data_version !== 'string' || !value.data_version.trim()) {
    addIssue(
      errors,
      'dataset_manifest',
      files.manifest,
      'data_version',
      'invalid_data_version',
      '样例数据集必须声明内部data_version。',
    )
  }
  if (
    typeof value.content_note !== 'string' ||
    !value.content_note.includes('待核验占位数据') ||
    !value.content_note.includes('不得作为正式史实引用')
  ) {
    addIssue(
      errors,
      'dataset_manifest',
      files.manifest,
      'content_note',
      'missing_sample_warning',
      'content_note必须声明待核验占位性质和禁止正式引用。',
    )
  }

  return value as unknown as PlaceDatasetManifest
}

function validatePlaces(value: unknown, errors: PlaceDataIssue[]) {
  if (!Array.isArray(value)) {
    addIssue(
      errors,
      'places_collection',
      files.places,
      '$',
      'invalid_collection',
      'places.json必须是数组。',
    )
    return []
  }

  const valid: Place[] = []
  const seenIds = new Set<string>()

  value.forEach((candidate, index) => {
    const fallbackId = `places[${index}]`
    if (!isRecord(candidate)) {
      addIssue(
        errors,
        fallbackId,
        files.places,
        '$',
        'invalid_record',
        '地点记录必须是对象。',
      )
      return
    }

    const id =
      typeof candidate.place_id === 'string' ? candidate.place_id : fallbackId
    const before = errors.length
    validateCommonFields(candidate, id, files.places, errors)

    if (!placeIdPattern.test(id)) {
      addIssue(
        errors,
        id,
        files.places,
        'place_id',
        'invalid_place_id',
        'place_id必须唯一并以place_开头。',
      )
    } else if (seenIds.has(id)) {
      addIssue(
        errors,
        id,
        files.places,
        'place_id',
        'duplicate_place_id',
        'place_id在数据集中重复。',
      )
    } else {
      seenIds.add(id)
    }

    if (
      candidate.modern_reference_name !== null &&
      (typeof candidate.modern_reference_name !== 'string' ||
        !candidate.modern_reference_name.trim())
    ) {
      addIssue(
        errors,
        id,
        files.places,
        'modern_reference_name',
        'invalid_nullable_string',
        'modern_reference_name必须为非空字符串或null。',
      )
    }
    if (!isOneOf(candidate.geometry_type, geometryTypes)) {
      addIssue(
        errors,
        id,
        files.places,
        'geometry_type',
        'invalid_geometry_type',
        'geometry_type枚举无效。',
      )
    }
    if (
      candidate.geometry_ref !== null &&
      (typeof candidate.geometry_ref !== 'string' ||
        !candidate.geometry_ref.trim())
    ) {
      addIssue(
        errors,
        id,
        files.places,
        'geometry_ref',
        'invalid_geometry_ref',
        'geometry_ref必须为非空字符串或null。',
      )
    }
    if (!isOneOf(candidate.spatial_precision, spatialPrecisions)) {
      addIssue(
        errors,
        id,
        files.places,
        'spatial_precision',
        'invalid_spatial_precision',
        'spatial_precision必须为S0—SU之一。',
      )
    }
    if (!isOneOf(candidate.match_status, matchStatuses)) {
      addIssue(
        errors,
        id,
        files.places,
        'match_status',
        'invalid_match_status',
        'match_status枚举无效。',
      )
    }
    if (
      candidate.match_note !== null &&
      (typeof candidate.match_note !== 'string' || !candidate.match_note.trim())
    ) {
      addIssue(
        errors,
        id,
        files.places,
        'match_note',
        'invalid_nullable_string',
        'match_note必须为非空字符串或null。',
      )
    }
    if (
      (candidate.match_status === 'probable' ||
        candidate.match_status === 'disputed') &&
      (typeof candidate.match_note !== 'string' || !candidate.match_note.trim())
    ) {
      addIssue(
        errors,
        id,
        files.places,
        'match_note',
        'match_note_required',
        'probable或disputed记录必须填写match_note。',
      )
    }
    if (!isOneOf(candidate.review_status, reviewStatuses)) {
      addIssue(
        errors,
        id,
        files.places,
        'review_status',
        'invalid_review_status',
        'review_status枚举无效。',
      )
    } else if (candidate.review_status !== 'draft') {
      addIssue(
        errors,
        id,
        files.places,
        'review_status',
        'sample_must_be_draft',
        '当前地点记录只能使用draft。',
      )
    }

    if (
      candidate.spatial_precision === 'SU' &&
      (candidate.geometry_type !== 'none' || candidate.geometry_ref !== null)
    ) {
      addIssue(
        errors,
        id,
        files.places,
        'geometry_ref',
        'su_must_not_have_geometry',
        'SU必须使用geometry_type=none且geometry_ref=null。',
      )
    }
    if (candidate.geometry_type === 'none' && candidate.geometry_ref !== null) {
      addIssue(
        errors,
        id,
        files.places,
        'geometry_ref',
        'none_must_not_have_geometry_ref',
        'geometry_type=none时geometry_ref必须为null。',
      )
    }
    if (
      candidate.geometry_type === 'point' &&
      (typeof candidate.geometry_ref !== 'string' ||
        !candidate.geometry_ref.trim())
    ) {
      addIssue(
        errors,
        id,
        files.places,
        'geometry_ref',
        'point_requires_geometry_ref',
        'Point地点必须引用GeoJSON Feature。',
      )
    }
    if (
      (candidate.spatial_precision === 'S4' ||
        candidate.spatial_precision === 'S5') &&
      candidate.geometry_type === 'point'
    ) {
      addIssue(
        errors,
        id,
        files.places,
        'geometry_type',
        'imprecise_area_cannot_be_point',
        'S4/S5不得伪造为精确Point。',
      )
    }
    if (
      (candidate.spatial_precision === 'S2' ||
        candidate.spatial_precision === 'S3') &&
      candidate.geometry_type === 'point' &&
      (typeof candidate.match_note !== 'string' ||
        !candidate.match_note.includes('代表点'))
    ) {
      addIssue(
        errors,
        id,
        files.places,
        'match_note',
        'representative_point_note_required',
        'S2/S3 Point必须明确说明代表点和非精确性质。',
      )
    }
    if (
      candidate.match_status === 'unmatched' &&
      candidate.geometry_type === 'point'
    ) {
      addIssue(
        errors,
        id,
        files.places,
        'geometry_type',
        'unmatched_cannot_have_point',
        'unmatched记录不得具有精确Point坐标。',
      )
    }

    if (errors.length === before) {
      valid.push(candidate as unknown as Place)
    }
  })

  return valid
}

function validateHistoricalNames(
  value: unknown,
  placeIds: Set<string>,
  errors: PlaceDataIssue[],
  warnings: PlaceDataIssue[],
) {
  if (!Array.isArray(value)) {
    addIssue(
      errors,
      'historical_names_collection',
      files.historicalNames,
      '$',
      'invalid_collection',
      'historical-place-names.json必须是数组。',
    )
    return []
  }

  const valid: HistoricalPlaceName[] = []
  const seenIds = new Set<string>()

  value.forEach((candidate, index) => {
    const fallbackId = `historicalNames[${index}]`
    if (!isRecord(candidate)) {
      addIssue(
        errors,
        fallbackId,
        files.historicalNames,
        '$',
        'invalid_record',
        '历史名称记录必须是对象。',
      )
      return
    }

    const id =
      typeof candidate.historical_name_id === 'string'
        ? candidate.historical_name_id
        : fallbackId
    const before = errors.length
    validateCommonFields(candidate, id, files.historicalNames, errors)

    if (!historicalNameIdPattern.test(id)) {
      addIssue(
        errors,
        id,
        files.historicalNames,
        'historical_name_id',
        'invalid_historical_name_id',
        'historical_name_id必须唯一并以hname_开头。',
      )
    } else if (seenIds.has(id)) {
      addIssue(
        errors,
        id,
        files.historicalNames,
        'historical_name_id',
        'duplicate_historical_name_id',
        'historical_name_id在数据集中重复。',
      )
    } else {
      seenIds.add(id)
    }
    if (
      typeof candidate.place_id !== 'string' ||
      !placeIds.has(candidate.place_id)
    ) {
      addIssue(
        errors,
        id,
        files.historicalNames,
        'place_id',
        'missing_place_reference',
        'place_id必须引用合法地点。',
      )
    }
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
      addIssue(
        errors,
        id,
        files.historicalNames,
        'name',
        'invalid_name',
        '历史名称去除首尾空白后必须非空。',
      )
    }
    if (!isOneOf(candidate.name_type, historicalNameTypes)) {
      addIssue(
        errors,
        id,
        files.historicalNames,
        'name_type',
        'invalid_name_type',
        'name_type枚举无效。',
      )
    }

    for (const field of ['valid_from', 'valid_to'] as const) {
      if (candidate[field] !== null && !isIsoDate(candidate[field])) {
        addIssue(
          errors,
          id,
          files.historicalNames,
          field,
          'invalid_date',
          `${field}必须为YYYY-MM-DD或null。`,
        )
      }
    }
    if (
      isIsoDate(candidate.valid_from) &&
      isIsoDate(candidate.valid_to) &&
      candidate.valid_to < candidate.valid_from
    ) {
      addIssue(
        errors,
        id,
        files.historicalNames,
        'valid_to',
        'invalid_date_range',
        'valid_to不得早于valid_from。',
      )
    }
    if (
      typeof candidate.claim_id !== 'string' ||
      !claimIdPattern.test(candidate.claim_id)
    ) {
      addIssue(
        errors,
        id,
        files.historicalNames,
        'claim_id',
        'invalid_claim_id',
        'claim_id必须为非空且以claim_开头。',
      )
    }

    if (errors.length === before) {
      valid.push(candidate as unknown as HistoricalPlaceName)
      addIssue(
        warnings,
        id,
        files.historicalNames,
        'claim_id',
        'claim_foreign_key_not_checked',
        '此处仅校验claim_前缀，claim外键存在性由统一校验器验证。',
      )
    }
  })

  return valid
}

function validateGeometries(value: unknown, errors: PlaceDataIssue[]) {
  const valid = new Map<string, SourceGeometryFeature>()
  if (
    !isRecord(value) ||
    value.type !== 'FeatureCollection' ||
    !Array.isArray(value.features)
  ) {
    addIssue(
      errors,
      'geometry_collection',
      files.geometries,
      '$',
      'invalid_feature_collection',
      '几何文件必须是GeoJSON FeatureCollection。',
    )
    return valid
  }

  const seenIds = new Set<string>()
  value.features.forEach((candidate, index) => {
    const fallbackId = `features[${index}]`
    if (!isRecord(candidate)) {
      addIssue(
        errors,
        fallbackId,
        files.geometries,
        '$',
        'invalid_feature',
        'GeoJSON Feature必须是对象。',
      )
      return
    }

    const id = typeof candidate.id === 'string' ? candidate.id : fallbackId
    const before = errors.length
    if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
      addIssue(
        errors,
        id,
        files.geometries,
        'id',
        'invalid_feature_id',
        'GeoJSON Feature id必须是非空字符串。',
      )
    } else if (seenIds.has(candidate.id)) {
      addIssue(
        errors,
        id,
        files.geometries,
        'id',
        'duplicate_feature_id',
        'GeoJSON Feature id重复。',
      )
    } else {
      seenIds.add(candidate.id)
    }

    if (candidate.type !== 'Feature') {
      addIssue(
        errors,
        id,
        files.geometries,
        'type',
        'invalid_feature_type',
        '记录必须为GeoJSON Feature。',
      )
    }
    if (
      !isRecord(candidate.properties) ||
      typeof candidate.properties.place_id !== 'string' ||
      !placeIdPattern.test(candidate.properties.place_id)
    ) {
      addIssue(
        errors,
        id,
        files.geometries,
        'properties.place_id',
        'invalid_geometry_place_id',
        '几何必须包含合法place_id连接属性。',
      )
    }
    if (!isRecord(candidate.geometry) || candidate.geometry.type !== 'Point') {
      addIssue(
        errors,
        id,
        files.geometries,
        'geometry.type',
        'unsupported_geometry',
        '地点几何文件只接受Point Feature。',
      )
    } else {
      const coordinates = candidate.geometry.coordinates
      if (!Array.isArray(coordinates) || coordinates.length !== 2) {
        addIssue(
          errors,
          id,
          files.geometries,
          'geometry.coordinates',
          'invalid_coordinate_dimension',
          'Point坐标必须严格为[longitude, latitude]两个值。',
        )
      } else {
        const [longitude, latitude] = coordinates
        if (
          typeof longitude !== 'number' ||
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180
        ) {
          addIssue(
            errors,
            id,
            files.geometries,
            'geometry.coordinates[0]',
            'invalid_longitude',
            '经度必须是[-180, 180]内的有限数字，且坐标顺序不得交换。',
          )
        }
        if (
          typeof latitude !== 'number' ||
          !Number.isFinite(latitude) ||
          latitude < -90 ||
          latitude > 90
        ) {
          addIssue(
            errors,
            id,
            files.geometries,
            'geometry.coordinates[1]',
            'invalid_latitude',
            '纬度必须是[-90, 90]内的有限数字，且坐标顺序不得交换。',
          )
        }
      }
    }

    if (errors.length === before) {
      valid.set(id, candidate as unknown as SourceGeometryFeature)
    }
  })

  return valid
}

function displayNameFor(
  place: Place,
  namesByPlace: Map<string, HistoricalPlaceName[]>,
) {
  const historicalName = namesByPlace.get(place.place_id)?.[0]
  if (historicalName) {
    return {
      value: historicalName.name,
      kind: historicalName.historical_name_id.includes('_placeholder')
        ? ('historical-placeholder' as const)
        : ('historical-name' as const),
    }
  }
  if (place.modern_reference_name) {
    return {
      value: `${place.modern_reference_name}（现代参照）`,
      kind: 'modern-reference' as const,
    }
  }
  return { value: place.place_id, kind: 'stable-id' as const }
}

export function validatePlaceDataset(
  input: PlaceDatasetInput,
): LoadedPlaceDataset {
  const errors: PlaceDataIssue[] = []
  const warnings: PlaceDataIssue[] = []
  const datasetPath = input.datasetPath ?? 'src/data/sample-draft/t04-places'

  if (/(^|[/\\])(data-)?published([/\\]|$)/i.test(datasetPath)) {
    addIssue(
      errors,
      'dataset_manifest',
      files.manifest,
      'datasetPath',
      'sample_in_published_directory',
      'sample-draft数据不得位于发布目录。',
    )
  }

  const manifest = validateManifest(input.manifest, errors)
  const places = validatePlaces(input.places, errors)
  const placeIds = new Set(places.map((place) => place.place_id))
  const historicalNames = validateHistoricalNames(
    input.historicalNames,
    placeIds,
    errors,
    warnings,
  )
  const geometries = validateGeometries(input.geometries, errors)
  const namesByPlace = new Map<string, HistoricalPlaceName[]>()

  for (const historicalName of historicalNames) {
    const names = namesByPlace.get(historicalName.place_id) ?? []
    names.push(historicalName)
    namesByPlace.set(historicalName.place_id, names)
  }

  const features: RenderPlaceFeature[] = []
  const unmapped = []
  for (const place of places) {
    if (place.geometry_type !== 'point' || !place.geometry_ref) {
      unmapped.push({
        place_id: place.place_id,
        reason:
          place.spatial_precision === 'SU'
            ? '空间未知（SU），按规则不落点。'
            : `${place.spatial_precision}/${place.geometry_type}不属于地点Point图层。`,
      })
      continue
    }

    const geometry = geometries.get(place.geometry_ref)
    if (!geometry) {
      addIssue(
        errors,
        place.place_id,
        files.places,
        'geometry_ref',
        'missing_geometry_reference',
        `geometry_ref ${place.geometry_ref}未找到合法GeoJSON Feature。`,
      )
      continue
    }
    if (geometry.properties.place_id !== place.place_id) {
      addIssue(
        errors,
        place.place_id,
        files.geometries,
        'properties.place_id',
        'geometry_place_mismatch',
        'GeoJSON Feature的place_id与引用地点不一致。',
      )
      continue
    }

    const displayName = displayNameFor(place, namesByPlace)
    features.push({
      type: 'Feature',
      id: place.geometry_ref,
      properties: {
        place_id: place.place_id,
        display_name: displayName.value,
        display_name_kind: displayName.kind,
        spatial_precision: place.spatial_precision,
        is_representative_point: place.match_note?.includes('代表点') ?? false,
        sample_notice: 'sample-draft/待核验数据，不得作为正式史实引用',
      },
      geometry: geometry.geometry,
    })
  }

  return {
    ok: errors.length === 0,
    manifest,
    places,
    historicalNames,
    featureCollection: { type: 'FeatureCollection', features },
    unmapped,
    warnings,
    errors,
  }
}

export function loadT04PlaceDataset() {
  return validatePlaceDataset({
    manifest: manifestJson,
    places: placesJson,
    historicalNames: historicalNamesJson,
    geometries: JSON.parse(geometriesText) as unknown,
  })
}
