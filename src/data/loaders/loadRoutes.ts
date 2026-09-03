import geometriesText from '../sample-draft/t06-routes/route-geometries.geojson?raw'
import manifestJson from '../sample-draft/t06-routes/manifest.json'
import routeSegmentsJson from '../sample-draft/t06-routes/route-segments.json'
import routesJson from '../sample-draft/t06-routes/routes.json'
import { timePrecisions } from '../../types/event'
import type { LoadedOrganizationDataset } from '../../types/organization'
import { spatialPrecisions, type LoadedPlaceDataset } from '../../types/place'
import {
  geometryMethods,
  movementTypes,
  routeCertainties,
  routeRoles,
  type LoadedRouteDataset,
  type RenderRouteFeature,
  type Route,
  type RouteDataIssue,
  type RouteDatasetInput,
  type RouteDatasetManifest,
  type RouteGeometryFeature,
  type RouteSegment,
} from '../../types/route'

const files = {
  manifest: 'src/data/sample-draft/t06-routes/manifest.json',
  routes: 'src/data/sample-draft/t06-routes/routes.json',
  segments: 'src/data/sample-draft/t06-routes/route-segments.json',
  geometries: 'src/data/sample-draft/t06-routes/route-geometries.geojson',
} as const

const frozenTopicId = 'topic_long_march_v1'
const routeIdPattern = /^route_[a-z0-9][a-z0-9_-]*$/
const segmentIdPattern = /^seg_[a-z0-9][a-z0-9_-]*$/
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const routeFields = new Set([
  'route_id',
  'topic_id',
  'organization_id',
  'title',
  'route_role',
  'review_status',
  'created_at',
  'updated_at',
  'data_version',
])
const routeSegmentFields = new Set([
  'route_segment_id',
  'route_id',
  'sequence_no',
  'organization_id',
  'from_place_id',
  'to_place_id',
  'time_original_text',
  'time_start',
  'time_end',
  'time_precision',
  'movement_type',
  'route_certainty',
  'spatial_precision',
  'geometry_ref',
  'geometry_method',
  'uncertainty_note',
  'review_status',
  'created_at',
  'updated_at',
  'data_version',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return typeof value === 'string' && options.includes(value)
}

function dateParts(value: unknown) {
  if (typeof value !== 'string' || !isoDatePattern.test(value)) {
    return null
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.includes('T') &&
    Number.isFinite(Date.parse(value))
  )
}

function addIssue(
  errors: RouteDataIssue[],
  file: string,
  recordId: string,
  field: string,
  errorCode: string,
  message: string,
) {
  errors.push({
    file,
    record_id: recordId,
    field,
    error_code: errorCode,
    message,
  })
}

function validateCommonFields(
  candidate: Record<string, unknown>,
  file: string,
  recordId: string,
  dataVersion: string | undefined,
  errors: RouteDataIssue[],
) {
  if (!isIsoDateTime(candidate.created_at)) {
    addIssue(
      errors,
      file,
      recordId,
      'created_at',
      'INVALID_CREATED_AT',
      'created_at必须为合法ISO 8601 datetime。',
    )
  }
  if (!isIsoDateTime(candidate.updated_at)) {
    addIssue(
      errors,
      file,
      recordId,
      'updated_at',
      'INVALID_UPDATED_AT',
      'updated_at必须为合法ISO 8601 datetime。',
    )
  }
  if (
    isIsoDateTime(candidate.created_at) &&
    isIsoDateTime(candidate.updated_at) &&
    Date.parse(candidate.updated_at) < Date.parse(candidate.created_at)
  ) {
    addIssue(
      errors,
      file,
      recordId,
      'updated_at',
      'UPDATED_BEFORE_CREATED',
      'updated_at不得早于created_at。',
    )
  }
  if (
    typeof candidate.data_version !== 'string' ||
    !candidate.data_version.trim()
  ) {
    addIssue(
      errors,
      file,
      recordId,
      'data_version',
      'INVALID_DATA_VERSION',
      'data_version必须为非空字符串。',
    )
  } else if (dataVersion && candidate.data_version !== dataVersion) {
    addIssue(
      errors,
      file,
      recordId,
      'data_version',
      'DATA_VERSION_MISMATCH',
      '记录data_version必须与manifest一致。',
    )
  }
}

function validateManifest(
  value: unknown,
  datasetPath: string,
  errors: RouteDataIssue[],
) {
  const id = 'dataset_manifest'
  if (/(^|[/\\])(data-)?published([/\\]|$)/i.test(datasetPath)) {
    addIssue(
      errors,
      files.manifest,
      id,
      'datasetPath',
      'SAMPLE_IN_PUBLISHED_DIRECTORY',
      'sample-draft路线数据不得位于发布目录。',
    )
  }
  if (!isRecord(value)) {
    addIssue(
      errors,
      files.manifest,
      id,
      '$',
      'INVALID_MANIFEST',
      '路线manifest必须为对象。',
    )
    return null
  }
  const expected = {
    dataset_tier: 'sample-draft',
    is_sample: true,
    publication_allowed: false,
    review_status: 'draft',
  } as const
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (value[field] !== expectedValue) {
      addIssue(
        errors,
        files.manifest,
        id,
        field,
        'INVALID_SAMPLE_MANIFEST',
        `${field}必须为${String(expectedValue)}。`,
      )
    }
  }
  if (typeof value.data_version !== 'string' || !value.data_version.trim()) {
    addIssue(
      errors,
      files.manifest,
      id,
      'data_version',
      'INVALID_DATA_VERSION',
      'manifest必须声明非空内部data_version。',
    )
  }
  if (
    typeof value.content_note !== 'string' ||
    !value.content_note.includes('待核验') ||
    !value.content_note.includes('不代表')
  ) {
    addIssue(
      errors,
      files.manifest,
      id,
      'content_note',
      'INVALID_CONTENT_NOTE',
      'content_note必须明确待核验且不代表已核验路线。',
    )
  }
  return value as unknown as RouteDatasetManifest
}

function validateOrganizationReference(
  organizationId: unknown,
  file: string,
  recordId: string,
  organizations: LoadedOrganizationDataset,
  errors: RouteDataIssue[],
) {
  if (typeof organizationId !== 'string') {
    addIssue(
      errors,
      file,
      recordId,
      'organization_id',
      'INVALID_ORGANIZATION_ID',
      'organization_id必须为字符串并引用合法组织。',
    )
    return
  }
  const result = organizations.registry.require(organizationId, {
    file,
    recordId,
    field: 'organization_id',
  })
  if (!result.ok) {
    addIssue(
      errors,
      result.error.file,
      result.error.record_id,
      result.error.field,
      result.error.error_code,
      result.error.message,
    )
  }
}

function validateRoutes(
  value: unknown,
  manifest: RouteDatasetManifest | null,
  organizations: LoadedOrganizationDataset,
  errors: RouteDataIssue[],
) {
  if (!Array.isArray(value)) {
    addIssue(
      errors,
      files.routes,
      'routes_collection',
      '$',
      'INVALID_ROUTES_FILE',
      'routes.json必须为数组。',
    )
    return []
  }

  const valid: Route[] = []
  const seen = new Set<string>()
  value.forEach((candidate, index) => {
    const fallbackId = `routes[${index}]`
    if (!isRecord(candidate)) {
      addIssue(
        errors,
        files.routes,
        fallbackId,
        '$',
        'INVALID_ROUTE_RECORD',
        'route记录必须为对象。',
      )
      return
    }
    const recordId =
      typeof candidate.route_id === 'string' ? candidate.route_id : fallbackId
    const before = errors.length
    for (const field of routeFields) {
      if (!(field in candidate)) {
        addIssue(
          errors,
          files.routes,
          recordId,
          field,
          'MISSING_REQUIRED_FIELD',
          `${field}是route必填字段。`,
        )
      }
    }
    for (const field of Object.keys(candidate)) {
      if (!routeFields.has(field)) {
        addIssue(
          errors,
          files.routes,
          recordId,
          field,
          'PROHIBITED_ROUTE_FIELD',
          `${field}不是基线route字段。`,
        )
      }
    }
    if (
      typeof candidate.route_id !== 'string' ||
      !routeIdPattern.test(candidate.route_id)
    ) {
      addIssue(
        errors,
        files.routes,
        recordId,
        'route_id',
        'INVALID_ROUTE_ID',
        'route_id必须符合route_稳定ID规则。',
      )
    } else if (seen.has(candidate.route_id)) {
      addIssue(
        errors,
        files.routes,
        recordId,
        'route_id',
        'DUPLICATE_ROUTE_ID',
        'route_id必须全局唯一。',
      )
    } else {
      seen.add(candidate.route_id)
    }
    if (candidate.topic_id !== frozenTopicId) {
      addIssue(
        errors,
        files.routes,
        recordId,
        'topic_id',
        'UNKNOWN_TOPIC_REFERENCE',
        `topic_id必须引用当前冻结专题${frozenTopicId}。`,
      )
    }
    validateOrganizationReference(
      candidate.organization_id,
      files.routes,
      recordId,
      organizations,
      errors,
    )
    if (typeof candidate.title !== 'string' || !candidate.title.trim()) {
      addIssue(
        errors,
        files.routes,
        recordId,
        'title',
        'INVALID_ROUTE_TITLE',
        'route.title必须为非空字符串。',
      )
    }
    if (!isOneOf(candidate.route_role, routeRoles)) {
      addIssue(
        errors,
        files.routes,
        recordId,
        'route_role',
        'INVALID_ROUTE_ROLE',
        'route_role不属于main、branch、related。',
      )
    }
    if (candidate.review_status !== 'draft') {
      addIssue(
        errors,
        files.routes,
        recordId,
        'review_status',
        'INVALID_REVIEW_STATUS',
        '当前路线记录只能为draft。',
      )
    }
    validateCommonFields(
      candidate,
      files.routes,
      recordId,
      manifest?.data_version,
      errors,
    )
    if (errors.length === before) {
      valid.push(candidate as unknown as Route)
    }
  })
  return valid
}

function validateTimeCombination(
  candidate: Record<string, unknown>,
  recordId: string,
  errors: RouteDataIssue[],
) {
  const precision = candidate.time_precision
  const start = candidate.time_start
  const end = candidate.time_end
  const startParts = start === null ? null : dateParts(start)
  const endParts = end === null ? null : dateParts(end)
  if (start !== null && !startParts) {
    addIssue(
      errors,
      files.segments,
      recordId,
      'time_start',
      'INVALID_DATE_FORMAT',
      'time_start必须为真实YYYY-MM-DD日期或null。',
    )
  }
  if (end !== null && !endParts) {
    addIssue(
      errors,
      files.segments,
      recordId,
      'time_end',
      'INVALID_DATE_FORMAT',
      'time_end必须为真实YYYY-MM-DD日期或null。',
    )
  }
  if (startParts && endParts && String(end) < String(start)) {
    addIssue(
      errors,
      files.segments,
      recordId,
      'time_end',
      'REVERSED_TIME_RANGE',
      'time_end不得早于time_start。',
    )
  }
  if (!isOneOf(precision, timePrecisions)) {
    return
  }
  if (precision === 'T0') {
    addIssue(
      errors,
      files.segments,
      recordId,
      'time_precision',
      'T0_NOT_REPRESENTABLE_BY_DATE_CONTRACT',
      'route_segment的date字段无法无损表达T0具体时刻。',
    )
    return
  }
  if (precision === 'T6' || precision === 'TU') {
    if (start !== null || end !== null) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'time_start,time_end',
        'INVALID_TIME_COMBINATION',
        `${precision}必须使用双null日期，不得伪填。`,
      )
    }
    return
  }
  if (!startParts || !endParts) {
    addIssue(
      errors,
      files.segments,
      recordId,
      'time_start,time_end',
      'INVALID_TIME_COMBINATION',
      `${precision}必须同时提供合法开始和结束日期。`,
    )
    return
  }
  let valid = true
  if (precision === 'T1') {
    valid = start === end
  } else if (precision === 'T2') {
    const expectedEnd =
      startParts.day === 1
        ? 10
        : startParts.day === 11
          ? 20
          : startParts.day === 21
            ? daysInMonth(startParts.year, startParts.month)
            : -1
    valid =
      startParts.year === endParts.year &&
      startParts.month === endParts.month &&
      endParts.day === expectedEnd
  } else if (precision === 'T3') {
    valid =
      startParts.year === endParts.year &&
      startParts.month === endParts.month &&
      startParts.day === 1 &&
      endParts.day === daysInMonth(startParts.year, startParts.month)
  } else if (precision === 'T5') {
    valid =
      startParts.year === endParts.year &&
      startParts.month === 1 &&
      startParts.day === 1 &&
      endParts.month === 12 &&
      endParts.day === 31
  }
  if (!valid) {
    addIssue(
      errors,
      files.segments,
      recordId,
      'time_start,time_end',
      'INVALID_TIME_COMBINATION',
      `${precision}日期边界与精度规则不一致。`,
    )
  }
}

function validateRouteSegments(
  value: unknown,
  routes: Route[],
  manifest: RouteDatasetManifest | null,
  places: LoadedPlaceDataset,
  organizations: LoadedOrganizationDataset,
  errors: RouteDataIssue[],
) {
  if (!Array.isArray(value)) {
    addIssue(
      errors,
      files.segments,
      'segments_collection',
      '$',
      'INVALID_ROUTE_SEGMENTS_FILE',
      'route-segments.json必须为数组。',
    )
    return []
  }
  const routeIds = new Set(routes.map((route) => route.route_id))
  const placeIds = new Set(places.places.map((place) => place.place_id))
  const seenIds = new Set<string>()
  const seenSequences = new Set<string>()
  const valid: RouteSegment[] = []

  value.forEach((candidate, index) => {
    const fallbackId = `routeSegments[${index}]`
    if (!isRecord(candidate)) {
      addIssue(
        errors,
        files.segments,
        fallbackId,
        '$',
        'INVALID_ROUTE_SEGMENT_RECORD',
        'route_segment记录必须为对象。',
      )
      return
    }
    const recordId =
      typeof candidate.route_segment_id === 'string'
        ? candidate.route_segment_id
        : fallbackId
    const before = errors.length
    for (const field of routeSegmentFields) {
      if (!(field in candidate)) {
        addIssue(
          errors,
          files.segments,
          recordId,
          field,
          'MISSING_REQUIRED_FIELD',
          `${field}是route_segment必填字段。`,
        )
      }
    }
    for (const field of Object.keys(candidate)) {
      if (!routeSegmentFields.has(field)) {
        addIssue(
          errors,
          files.segments,
          recordId,
          field,
          'PROHIBITED_ROUTE_SEGMENT_FIELD',
          `${field}不是基线route_segment字段。`,
        )
      }
    }
    if (
      typeof candidate.route_segment_id !== 'string' ||
      !segmentIdPattern.test(candidate.route_segment_id)
    ) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'route_segment_id',
        'INVALID_ROUTE_SEGMENT_ID',
        'route_segment_id必须符合seg_稳定ID规则。',
      )
    } else if (seenIds.has(candidate.route_segment_id)) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'route_segment_id',
        'DUPLICATE_ROUTE_SEGMENT_ID',
        'route_segment_id必须全局唯一。',
      )
    } else {
      seenIds.add(candidate.route_segment_id)
    }
    if (
      typeof candidate.route_id !== 'string' ||
      !routeIds.has(candidate.route_id)
    ) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'route_id',
        'UNKNOWN_ROUTE_REFERENCE',
        'route_id未引用本数据集内合法route。',
      )
    }
    if (
      !Number.isInteger(candidate.sequence_no) ||
      Number(candidate.sequence_no) <= 0
    ) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'sequence_no',
        'INVALID_SEQUENCE_NO',
        'sequence_no必须为大于0的整数。',
      )
    } else if (typeof candidate.route_id === 'string') {
      const key = `${candidate.route_id}:${String(candidate.sequence_no)}`
      if (seenSequences.has(key)) {
        addIssue(
          errors,
          files.segments,
          recordId,
          'sequence_no',
          'DUPLICATE_ROUTE_SEQUENCE',
          '同一route内sequence_no必须唯一。',
        )
      } else {
        seenSequences.add(key)
      }
    }
    validateOrganizationReference(
      candidate.organization_id,
      files.segments,
      recordId,
      organizations,
      errors,
    )
    for (const field of ['from_place_id', 'to_place_id'] as const) {
      const placeId = candidate[field]
      if (
        placeId !== null &&
        (typeof placeId !== 'string' || !placeIds.has(placeId))
      ) {
        addIssue(
          errors,
          files.segments,
          recordId,
          field,
          'UNKNOWN_PLACE_REFERENCE',
          `${field}必须为null或引用合法地点。`,
        )
      }
    }
    if (
      candidate.from_place_id === null &&
      candidate.to_place_id === null &&
      candidate.route_certainty !== 'RU'
    ) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'from_place_id,to_place_id',
        'MISSING_ENDPOINTS',
        '两端均为null时必须使用RU并明确资料不足。',
      )
    }
    if (
      typeof candidate.time_original_text !== 'string' ||
      !candidate.time_original_text.trim()
    ) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'time_original_text',
        'EMPTY_TIME_ORIGINAL_TEXT',
        'time_original_text必须保留非空待核验文本。',
      )
    }
    if (!isOneOf(candidate.time_precision, timePrecisions)) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'time_precision',
        'INVALID_TIME_PRECISION',
        'time_precision必须为T0—TU。',
      )
    }
    validateTimeCombination(candidate, recordId, errors)
    if (!isOneOf(candidate.movement_type, movementTypes)) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'movement_type',
        'INVALID_MOVEMENT_TYPE',
        'movement_type不属于冻结枚举。',
      )
    }
    if (!isOneOf(candidate.route_certainty, routeCertainties)) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'route_certainty',
        'INVALID_ROUTE_CERTAINTY',
        'route_certainty必须为R1、R2、R3、R4、R5、RU。',
      )
    }
    if (!isOneOf(candidate.spatial_precision, spatialPrecisions)) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'spatial_precision',
        'INVALID_SPATIAL_PRECISION',
        'spatial_precision必须为S0—SU。',
      )
    }
    if (
      candidate.geometry_ref !== null &&
      (typeof candidate.geometry_ref !== 'string' ||
        !candidate.geometry_ref.trim())
    ) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'geometry_ref',
        'INVALID_GEOMETRY_REF',
        'geometry_ref必须为非空字符串或null。',
      )
    }
    if (!isOneOf(candidate.geometry_method, geometryMethods)) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'geometry_method',
        'INVALID_GEOMETRY_METHOD',
        'geometry_method不属于冻结枚举。',
      )
    }
    if (
      candidate.route_certainty !== 'R1' &&
      (typeof candidate.uncertainty_note !== 'string' ||
        !candidate.uncertainty_note.trim())
    ) {
      addIssue(
        errors,
        files.segments,
        recordId,
        'uncertainty_note',
        'UNCERTAINTY_NOTE_REQUIRED',
        'R2—RU必须填写uncertainty_note。',
      )
    }
    if (candidate.review_status !== 'draft') {
      addIssue(
        errors,
        files.segments,
        recordId,
        'review_status',
        'INVALID_REVIEW_STATUS',
        '当前路线段记录只能为draft。',
      )
    }
    validateCommonFields(
      candidate,
      files.segments,
      recordId,
      manifest?.data_version,
      errors,
    )
    if (errors.length === before) {
      valid.push(candidate as unknown as RouteSegment)
    }
  })
  return valid
}

function validatePosition(
  value: unknown,
  recordId: string,
  field: string,
  errors: RouteDataIssue[],
) {
  if (!Array.isArray(value) || value.length !== 2) {
    addIssue(
      errors,
      files.geometries,
      recordId,
      field,
      'INVALID_COORDINATE_DIMENSION',
      '坐标必须严格为[longitude, latitude]。',
    )
    return false
  }
  const [longitude, latitude] = value
  let valid = true
  if (
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    addIssue(
      errors,
      files.geometries,
      recordId,
      `${field}[0]`,
      'INVALID_LONGITUDE',
      '经度必须是[-180,180]内有限数值；不自动交换坐标。',
    )
    valid = false
  }
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    addIssue(
      errors,
      files.geometries,
      recordId,
      `${field}[1]`,
      'INVALID_LATITUDE',
      '纬度必须是[-90,90]内有限数值；不自动交换坐标。',
    )
    valid = false
  }
  return valid
}

function validateGeometries(value: unknown, errors: RouteDataIssue[]) {
  const valid: RouteGeometryFeature[] = []
  if (
    !isRecord(value) ||
    value.type !== 'FeatureCollection' ||
    !Array.isArray(value.features)
  ) {
    addIssue(
      errors,
      files.geometries,
      'geometry_collection',
      '$',
      'INVALID_FEATURE_COLLECTION',
      '路线几何必须为GeoJSON FeatureCollection。',
    )
    return valid
  }
  const seenIds = new Set<string>()
  value.features.forEach((candidate, index) => {
    const fallbackId = `features[${index}]`
    if (!isRecord(candidate)) {
      addIssue(
        errors,
        files.geometries,
        fallbackId,
        '$',
        'INVALID_GEOMETRY_FEATURE',
        '路线几何Feature必须为对象。',
      )
      return
    }
    const recordId =
      typeof candidate.id === 'string' ? candidate.id : fallbackId
    const before = errors.length
    if (candidate.type !== 'Feature') {
      addIssue(
        errors,
        files.geometries,
        recordId,
        'type',
        'INVALID_FEATURE_TYPE',
        '记录必须为GeoJSON Feature。',
      )
    }
    if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
      addIssue(
        errors,
        files.geometries,
        recordId,
        'id',
        'INVALID_FEATURE_ID',
        'Feature id必须是非空稳定字符串。',
      )
    } else if (seenIds.has(candidate.id)) {
      addIssue(
        errors,
        files.geometries,
        recordId,
        'id',
        'DUPLICATE_FEATURE_ID',
        'Feature id必须唯一。',
      )
    } else {
      seenIds.add(candidate.id)
    }
    if (!isRecord(candidate.properties)) {
      addIssue(
        errors,
        files.geometries,
        recordId,
        'properties',
        'INVALID_GEOMETRY_PROPERTIES',
        'Feature properties必须为对象。',
      )
    } else {
      for (const field of ['geometry_ref', 'route_segment_id'] as const) {
        if (
          typeof candidate.properties[field] !== 'string' ||
          !candidate.properties[field].trim()
        ) {
          addIssue(
            errors,
            files.geometries,
            recordId,
            `properties.${field}`,
            'INVALID_GEOMETRY_PROPERTIES',
            `${field}必须是非空字符串。`,
          )
        }
      }
      for (const field of ['alternative_id', 'alternative_label'] as const) {
        const fieldValue = candidate.properties[field]
        if (
          fieldValue !== null &&
          (typeof fieldValue !== 'string' || !fieldValue.trim())
        ) {
          addIssue(
            errors,
            files.geometries,
            recordId,
            `properties.${field}`,
            'INVALID_ALTERNATIVE_PROPERTY',
            `${field}必须为非空字符串或null。`,
          )
        }
      }
    }
    if (!isRecord(candidate.geometry)) {
      addIssue(
        errors,
        files.geometries,
        recordId,
        'geometry',
        'INVALID_GEOMETRY',
        'Feature必须包含几何对象。',
      )
    } else if (candidate.geometry.type === 'LineString') {
      const coordinates = candidate.geometry.coordinates
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        addIssue(
          errors,
          files.geometries,
          recordId,
          'geometry.coordinates',
          'LINESTRING_TOO_SHORT',
          'LineString至少需要两个坐标点。',
        )
      } else {
        coordinates.forEach((position, positionIndex) =>
          validatePosition(
            position,
            recordId,
            `geometry.coordinates[${positionIndex}]`,
            errors,
          ),
        )
        if (
          new Set(coordinates.map((position) => JSON.stringify(position)))
            .size < 2
        ) {
          addIssue(
            errors,
            files.geometries,
            recordId,
            'geometry.coordinates',
            'LINESTRING_IDENTICAL_POINTS',
            'LineString必须包含至少两个不同坐标点。',
          )
        }
      }
    } else if (candidate.geometry.type === 'Polygon') {
      const rings = candidate.geometry.coordinates
      if (
        !Array.isArray(rings) ||
        rings.length === 0 ||
        !Array.isArray(rings[0])
      ) {
        addIssue(
          errors,
          files.geometries,
          recordId,
          'geometry.coordinates',
          'INVALID_POLYGON',
          'Polygon必须至少包含一个有效环。',
        )
      } else {
        rings.forEach((ring, ringIndex) => {
          if (!Array.isArray(ring) || ring.length < 4) {
            addIssue(
              errors,
              files.geometries,
              recordId,
              `geometry.coordinates[${ringIndex}]`,
              'INVALID_POLYGON_RING',
              'Polygon环至少需要四个坐标并闭合。',
            )
            return
          }
          ring.forEach((position, positionIndex) =>
            validatePosition(
              position,
              recordId,
              `geometry.coordinates[${ringIndex}][${positionIndex}]`,
              errors,
            ),
          )
          if (JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) {
            addIssue(
              errors,
              files.geometries,
              recordId,
              `geometry.coordinates[${ringIndex}]`,
              'POLYGON_RING_NOT_CLOSED',
              'Polygon环必须在源数据中明确闭合，不自动补齐。',
            )
          }
        })
      }
    } else {
      addIssue(
        errors,
        files.geometries,
        recordId,
        'geometry.type',
        'UNSUPPORTED_ROUTE_GEOMETRY',
        '路线数据只接受LineString或Polygon几何。',
      )
    }
    if (errors.length === before) {
      valid.push(candidate as unknown as RouteGeometryFeature)
    }
  })
  return valid
}

function geometryMatchesSegment(
  segment: RouteSegment,
  features: RouteGeometryFeature[],
  errors: RouteDataIssue[],
) {
  const before = errors.length
  if (segment.route_certainty === 'R5' || segment.route_certainty === 'RU') {
    if (segment.geometry_ref !== null) {
      addIssue(
        errors,
        files.segments,
        segment.route_segment_id,
        'geometry_ref',
        'UNKNOWN_ROUTE_GEOMETRY_FORBIDDEN',
        `${segment.route_certainty}不得带连接几何。`,
      )
    }
    if (
      segment.route_certainty === 'R5' &&
      !['direction_only', 'none'].includes(segment.geometry_method)
    ) {
      addIssue(
        errors,
        files.segments,
        segment.route_segment_id,
        'geometry_method',
        'INVALID_CERTAINTY_METHOD',
        'R5只允许direction_only或none，且不得生成连接线。',
      )
    }
    if (
      segment.route_certainty === 'RU' &&
      segment.geometry_method !== 'none'
    ) {
      addIssue(
        errors,
        files.segments,
        segment.route_segment_id,
        'geometry_method',
        'INVALID_CERTAINTY_METHOD',
        'RU必须使用geometry_method=none。',
      )
    }
    if (
      segment.route_certainty === 'RU' &&
      segment.spatial_precision !== 'SU'
    ) {
      addIssue(
        errors,
        files.segments,
        segment.route_segment_id,
        'spatial_precision',
        'INVALID_CERTAINTY_SPATIAL_PRECISION',
        'RU必须使用SU空间精度。',
      )
    }
    if (
      segment.route_certainty === 'R5' &&
      !['S5', 'SU'].includes(segment.spatial_precision)
    ) {
      addIssue(
        errors,
        files.segments,
        segment.route_segment_id,
        'spatial_precision',
        'INVALID_CERTAINTY_SPATIAL_PRECISION',
        'R5必须使用S5或SU空间表达。',
      )
    }
    return errors.length === before
  }

  if (!segment.geometry_ref) {
    addIssue(
      errors,
      files.segments,
      segment.route_segment_id,
      'geometry_ref',
      'GEOMETRY_REQUIRED',
      `${segment.route_certainty}必须引用结构测试几何。`,
    )
    return false
  }
  if (features.length === 0) {
    addIssue(
      errors,
      files.segments,
      segment.route_segment_id,
      'geometry_ref',
      'GEOMETRY_REFERENCE_NOT_FOUND',
      `geometry_ref ${segment.geometry_ref}未解析到合法Feature。`,
    )
    return false
  }
  if (
    features.some(
      (feature) =>
        feature.properties.route_segment_id !== segment.route_segment_id,
    )
  ) {
    addIssue(
      errors,
      files.geometries,
      segment.route_segment_id,
      'properties.route_segment_id',
      'GEOMETRY_SEGMENT_MISMATCH',
      '几何Feature的route_segment_id与引用路段不一致。',
    )
  }

  const expectedMethods = {
    R1: 'source_trace',
    R2: 'point_sequence',
    R3: 'corridor',
  } as const
  if (
    segment.route_certainty in expectedMethods &&
    segment.geometry_method !==
      expectedMethods[segment.route_certainty as keyof typeof expectedMethods]
  ) {
    addIssue(
      errors,
      files.segments,
      segment.route_segment_id,
      'geometry_method',
      'INVALID_CERTAINTY_METHOD',
      `${segment.route_certainty}的geometry_method与冻结规则不一致。`,
    )
  }
  if (segment.route_certainty === 'R3') {
    if (segment.spatial_precision !== 'S4') {
      addIssue(
        errors,
        files.segments,
        segment.route_segment_id,
        'spatial_precision',
        'INVALID_CERTAINTY_SPATIAL_PRECISION',
        'R3大致通道必须使用S4。',
      )
    }
    if (features.some((feature) => feature.geometry.type !== 'Polygon')) {
      addIssue(
        errors,
        files.geometries,
        segment.route_segment_id,
        'geometry.type',
        'R3_REQUIRES_CORRIDOR_POLYGON',
        'R3必须以Polygon廊道表达，不暴露中心线。',
      )
    }
  } else if (
    features.some((feature) => feature.geometry.type !== 'LineString')
  ) {
    addIssue(
      errors,
      files.geometries,
      segment.route_segment_id,
      'geometry.type',
      'LINE_GEOMETRY_REQUIRED',
      `${segment.route_certainty}结构测试必须使用LineString。`,
    )
  }
  if (segment.route_certainty === 'R4') {
    const alternatives = features.map(
      (feature) => feature.properties.alternative_id,
    )
    if (
      features.length < 2 ||
      alternatives.some((alternative) => !alternative) ||
      new Set(alternatives).size !== features.length ||
      features.some((feature) => !feature.properties.alternative_label)
    ) {
      addIssue(
        errors,
        files.geometries,
        segment.route_segment_id,
        'properties.alternative_id',
        'R4_REQUIRES_SEPARATE_ALTERNATIVES',
        'R4必须引用至少两个具有唯一ID和可访问标签的分离方案。',
      )
    }
    if (segment.geometry_method === 'none') {
      addIssue(
        errors,
        files.segments,
        segment.route_segment_id,
        'geometry_method',
        'INVALID_CERTAINTY_METHOD',
        'R4 geometry_method不得为none。',
      )
    }
  } else if (features.length !== 1) {
    addIssue(
      errors,
      files.geometries,
      segment.route_segment_id,
      'properties.geometry_ref',
      'NON_R4_GEOMETRY_NOT_UNIQUE',
      '非R4 geometry_ref必须唯一解析到一个Feature。',
    )
  }
  return errors.length === before
}

export function validateRouteDataset(
  input: RouteDatasetInput,
  places: LoadedPlaceDataset,
  organizations: LoadedOrganizationDataset,
): LoadedRouteDataset {
  const errors: RouteDataIssue[] = []
  const datasetPath = input.datasetPath ?? 'src/data/sample-draft/t06-routes'
  if (!organizations.ok) {
    addIssue(
      errors,
      files.routes,
      'organization_registry',
      'organization_id',
      'ORGANIZATION_REGISTRY_UNAVAILABLE',
      'organization注册表加载失败，路线不得继续加载。',
    )
  }
  const manifest = validateManifest(input.manifest, datasetPath, errors)
  const routes = validateRoutes(input.routes, manifest, organizations, errors)
  const routeSegments = validateRouteSegments(
    input.routeSegments,
    routes,
    manifest,
    places,
    organizations,
    errors,
  )
  const geometryFeatures = validateGeometries(input.geometries, errors)
  const geometryByReference = new Map<string, RouteGeometryFeature[]>()
  for (const feature of geometryFeatures) {
    const collection =
      geometryByReference.get(feature.properties.geometry_ref) ?? []
    collection.push(feature)
    geometryByReference.set(feature.properties.geometry_ref, collection)
  }

  const routesById = new Map(routes.map((route) => [route.route_id, route]))
  const validSegments: RouteSegment[] = []
  const renderFeatures: RenderRouteFeature[] = []
  const unmapped = []
  const referencedGeometryIds = new Set<string>()

  for (const segment of routeSegments) {
    const features = segment.geometry_ref
      ? (geometryByReference.get(segment.geometry_ref) ?? [])
      : []
    if (!geometryMatchesSegment(segment, features, errors)) {
      continue
    }
    validSegments.push(segment)
    if (!segment.geometry_ref) {
      unmapped.push({
        route_segment_id: segment.route_segment_id,
        reason:
          segment.route_certainty === 'R5'
            ? 'R5中间路线不详；保持断裂且不生成连接几何。'
            : 'RU资料不足；仅进入列表且不地图化。',
      })
      continue
    }
    referencedGeometryIds.add(segment.geometry_ref)
    const route = routesById.get(segment.route_id)
    if (!route) {
      continue
    }
    for (const feature of features) {
      renderFeatures.push({
        ...feature,
        properties: {
          ...feature.properties,
          route_id: route.route_id,
          route_title: route.title,
          route_role: route.route_role,
          sequence_no: segment.sequence_no,
          organization_id: segment.organization_id,
          route_certainty: segment.route_certainty,
          spatial_precision: segment.spatial_precision,
          geometry_method: segment.geometry_method,
          sample_notice:
            'sample-draft/待核验结构测试数据，不构成正式历史路线结论',
        },
      })
    }
  }

  for (const geometryRef of geometryByReference.keys()) {
    if (!referencedGeometryIds.has(geometryRef)) {
      addIssue(
        errors,
        files.geometries,
        geometryRef,
        'properties.geometry_ref',
        'ORPHAN_ROUTE_GEOMETRY',
        '合法GeoJSON几何未被任何合法route_segment引用。',
      )
    }
  }

  return {
    ok: errors.length === 0,
    manifest,
    routes,
    routeSegments: validSegments,
    featureCollection: { type: 'FeatureCollection', features: renderFeatures },
    unmapped,
    errors,
  }
}

export function loadT06RouteDataset(
  places: LoadedPlaceDataset,
  organizations: LoadedOrganizationDataset,
) {
  return validateRouteDataset(
    {
      manifest: manifestJson,
      routes: routesJson,
      routeSegments: routeSegmentsJson,
      geometries: JSON.parse(geometriesText) as unknown,
    },
    places,
    organizations,
  )
}
