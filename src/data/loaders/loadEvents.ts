import manifestJson from '../sample-draft/t05-events/manifest.json'
import eventsJson from '../sample-draft/t05-events/events.json'
import {
  eventTypePresentation,
  eventTypes,
  timePrecisions,
  type EventDataIssue,
  type EventDatasetInput,
  type EventDatasetManifest,
  type HistoricalEvent,
  type LoadedEventDataset,
  type RenderEventFeature,
} from '../../types/event'
import {
  reviewStatuses,
  spatialPrecisions,
  type LoadedPlaceDataset,
  type SpatialPrecision,
} from '../../types/place'

const files = {
  manifest: 'src/data/sample-draft/t05-events/manifest.json',
  events: 'src/data/sample-draft/t05-events/events.json',
} as const

const eventIdPattern = /^event_[a-z0-9][a-z0-9_-]*$/
const topicIdPattern = /^topic_[a-z0-9][a-z0-9_-]*$/
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const frozenTopicId = 'topic_long_march_v1'
const allowedSummaries = new Set([
  '待核验占位数据',
  '结构测试/待核验占位数据',
  '资料记载1934年12月15日红一军团攻占黎平县城；地图位置仅为S1县城级代表点，不表示具体战斗位置。',
])
const prohibitedAliases = ['date', 'lat', 'lng', 'name', 'status'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return typeof value === 'string' && options.includes(value)
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    value.includes('T')
  )
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

function addIssue(
  issues: EventDataIssue[],
  recordId: string,
  file: string,
  field: string,
  errorCode: string,
  message: string,
) {
  issues.push({
    file,
    record_id: recordId,
    field,
    error_code: errorCode,
    message,
  })
}

function validateCommonFields(
  value: Record<string, unknown>,
  recordId: string,
  errors: EventDataIssue[],
) {
  const createdAt = value.created_at
  const updatedAt = value.updated_at
  if (!isIsoDateTime(createdAt)) {
    addIssue(
      errors,
      recordId,
      files.events,
      'created_at',
      'INVALID_CREATED_AT',
      'created_at必须为合法ISO 8601 datetime。',
    )
  }
  if (!isIsoDateTime(updatedAt)) {
    addIssue(
      errors,
      recordId,
      files.events,
      'updated_at',
      'INVALID_UPDATED_AT',
      'updated_at必须为合法ISO 8601 datetime。',
    )
  }
  if (
    isIsoDateTime(createdAt) &&
    isIsoDateTime(updatedAt) &&
    Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    addIssue(
      errors,
      recordId,
      files.events,
      'updated_at',
      'UPDATED_BEFORE_CREATED',
      'updated_at不得早于created_at。',
    )
  }
  if (typeof value.data_version !== 'string' || !value.data_version.trim()) {
    addIssue(
      errors,
      recordId,
      files.events,
      'data_version',
      'INVALID_DATA_VERSION',
      'data_version必须为非空内部版本字符串。',
    )
  }
}

function validateManifest(
  value: unknown,
  datasetPath: string,
  errors: EventDataIssue[],
) {
  const id = 'dataset_manifest'
  if (/(^|[/\\])(data-)?published([/\\]|$)/i.test(datasetPath)) {
    addIssue(
      errors,
      id,
      files.manifest,
      'datasetPath',
      'SAMPLE_IN_PUBLISHED_DIRECTORY',
      'sample-draft事件数据不得位于发布目录。',
    )
  }
  if (!isRecord(value)) {
    addIssue(
      errors,
      id,
      files.manifest,
      'manifest',
      'INVALID_MANIFEST',
      '事件数据集manifest必须为对象。',
    )
    return null
  }

  const required = {
    dataset_tier: 'sample-draft',
    is_sample: true,
    publication_allowed: false,
    review_status: 'draft',
  } as const
  for (const [field, expected] of Object.entries(required)) {
    if (value[field] !== expected) {
      addIssue(
        errors,
        id,
        files.manifest,
        field,
        'INVALID_SAMPLE_MANIFEST',
        `${field}必须保持当前sample-draft数据集固定值。`,
      )
    }
  }
  if (typeof value.data_version !== 'string' || !value.data_version.trim()) {
    addIssue(
      errors,
      id,
      files.manifest,
      'data_version',
      'INVALID_DATA_VERSION',
      'manifest data_version必须为非空内部版本。',
    )
  }
  if (
    typeof value.content_note !== 'string' ||
    !value.content_note.includes('待核验') ||
    !value.content_note.includes('不代表')
  ) {
    addIssue(
      errors,
      id,
      files.manifest,
      'content_note',
      'INVALID_CONTENT_NOTE',
      'content_note必须明确待核验且不代表已核验史实。',
    )
  }

  return value as unknown as EventDatasetManifest
}

function validateTimeCombination(
  value: Record<string, unknown>,
  recordId: string,
  errors: EventDataIssue[],
) {
  const precision = value.time_precision
  const start = value.time_start
  const end = value.time_end
  const startParts = start === null ? null : dateParts(start)
  const endParts = end === null ? null : dateParts(end)

  if (start !== null && !startParts) {
    addIssue(
      errors,
      recordId,
      files.events,
      'time_start',
      'INVALID_DATE_FORMAT',
      'time_start必须为真实存在的YYYY-MM-DD日期或null。',
    )
  }
  if (end !== null && !endParts) {
    addIssue(
      errors,
      recordId,
      files.events,
      'time_end',
      'INVALID_DATE_FORMAT',
      'time_end必须为真实存在的YYYY-MM-DD日期或null。',
    )
  }
  if (
    typeof start === 'string' &&
    typeof end === 'string' &&
    startParts &&
    endParts &&
    end < start
  ) {
    addIssue(
      errors,
      recordId,
      files.events,
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
      recordId,
      files.events,
      'time_precision',
      'T0_NOT_REPRESENTABLE_BY_DATE_CONTRACT',
      'event的date字段无法承载T0时刻；当前数据契约不扩展字段。',
    )
    return
  }
  if (precision === 'T6' || precision === 'TU') {
    if (start !== null || end !== null) {
      addIssue(
        errors,
        recordId,
        files.events,
        'time_start,time_end',
        'INVALID_TIME_COMBINATION',
        `${precision}必须使用双null日期。`,
      )
    }
    return
  }
  if (!startParts || !endParts) {
    addIssue(
      errors,
      recordId,
      files.events,
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
      recordId,
      files.events,
      'time_start,time_end',
      'INVALID_TIME_COMBINATION',
      `${precision}的日期边界与精度规则不一致。`,
    )
  }
}

function validateEvents(value: unknown, errors: EventDataIssue[]) {
  if (!Array.isArray(value)) {
    addIssue(
      errors,
      'events',
      files.events,
      'events',
      'INVALID_EVENTS_FILE',
      'events.json必须为数组。',
    )
    return []
  }

  const valid: HistoricalEvent[] = []
  const seenIds = new Set<string>()
  value.forEach((candidate, index) => {
    const fallbackId = `events[${index}]`
    if (!isRecord(candidate)) {
      addIssue(
        errors,
        fallbackId,
        files.events,
        'record',
        'INVALID_EVENT_RECORD',
        '事件记录必须为对象。',
      )
      return
    }

    const recordId =
      typeof candidate.event_id === 'string' ? candidate.event_id : fallbackId
    const before = errors.length
    if (
      typeof candidate.event_id !== 'string' ||
      !eventIdPattern.test(candidate.event_id)
    ) {
      addIssue(
        errors,
        recordId,
        files.events,
        'event_id',
        'INVALID_EVENT_ID',
        'event_id必须非空、以event_开头并符合稳定ID规则。',
      )
    } else if (seenIds.has(candidate.event_id)) {
      addIssue(
        errors,
        recordId,
        files.events,
        'event_id',
        'DUPLICATE_EVENT_ID',
        'event_id在数据集内必须唯一。',
      )
    } else {
      seenIds.add(candidate.event_id)
    }

    if (
      typeof candidate.topic_id !== 'string' ||
      !topicIdPattern.test(candidate.topic_id) ||
      candidate.topic_id !== frozenTopicId
    ) {
      addIssue(
        errors,
        recordId,
        files.events,
        'topic_id',
        'INVALID_TOPIC_ID',
        `topic_id必须为冻结值${frozenTopicId}。`,
      )
    }
    if (
      typeof candidate.title !== 'string' ||
      candidate.title.trim().length < 2 ||
      candidate.title.trim().length > 100
    ) {
      addIssue(
        errors,
        recordId,
        files.events,
        'title',
        'INVALID_TITLE',
        'title去除首尾空格后必须为2—100字。',
      )
    }
    if (!isOneOf(candidate.event_type, eventTypes)) {
      addIssue(
        errors,
        recordId,
        files.events,
        'event_type',
        'INVALID_EVENT_TYPE',
        'event_type不属于九种冻结枚举。',
      )
    }
    if (
      typeof candidate.time_original_text !== 'string' ||
      !candidate.time_original_text.trim()
    ) {
      addIssue(
        errors,
        recordId,
        files.events,
        'time_original_text',
        'EMPTY_TIME_ORIGINAL_TEXT',
        'time_original_text必须保留非空原始或占位时间文本。',
      )
    }
    if (!isOneOf(candidate.time_precision, timePrecisions)) {
      addIssue(
        errors,
        recordId,
        files.events,
        'time_precision',
        'INVALID_TIME_PRECISION',
        'time_precision必须为T0—TU冻结枚举。',
      )
    }
    validateTimeCombination(candidate, recordId, errors)

    if (
      candidate.place_id !== null &&
      (typeof candidate.place_id !== 'string' ||
        !candidate.place_id.startsWith('place_'))
    ) {
      addIssue(
        errors,
        recordId,
        files.events,
        'place_id',
        'INVALID_PLACE_ID',
        'place_id必须为place_前缀字符串或null。',
      )
    }
    if (!isOneOf(candidate.spatial_precision, spatialPrecisions)) {
      addIssue(
        errors,
        recordId,
        files.events,
        'spatial_precision',
        'INVALID_SPATIAL_PRECISION',
        'spatial_precision必须为S0—SU冻结枚举。',
      )
    }
    if (candidate.spatial_precision === 'SU' && candidate.place_id !== null) {
      addIssue(
        errors,
        recordId,
        files.events,
        'place_id',
        'SU_EVENT_HAS_PLACE',
        'SU事件的place_id必须为null。',
      )
    }
    if (candidate.spatial_precision !== 'SU' && candidate.place_id === null) {
      addIssue(
        errors,
        recordId,
        files.events,
        'place_id',
        'MISSING_PLACE_REFERENCE',
        '非SU事件必须引用合法地点。',
      )
    }
    if (
      candidate.summary !== null &&
      (typeof candidate.summary !== 'string' ||
        !allowedSummaries.has(candidate.summary))
    ) {
      addIssue(
        errors,
        recordId,
        files.events,
        'summary',
        'INVALID_SUMMARY',
        'sample-draft summary只能为null或明确的待核验结构说明。',
      )
    }
    if (
      !isOneOf(candidate.review_status, reviewStatuses) ||
      candidate.review_status !== 'draft'
    ) {
      addIssue(
        errors,
        recordId,
        files.events,
        'review_status',
        'INVALID_REVIEW_STATUS',
        '当前event的review_status必须固定为draft。',
      )
    }
    for (const alias of prohibitedAliases) {
      if (alias in candidate) {
        addIssue(
          errors,
          recordId,
          files.events,
          alias,
          'PROHIBITED_ALIAS_FIELD',
          `不得使用${alias}替代冻结字段。`,
        )
      }
    }
    validateCommonFields(candidate, recordId, errors)

    if (errors.length === before) {
      valid.push(candidate as unknown as HistoricalEvent)
    }
  })
  return valid
}

function spatialRank(precision: SpatialPrecision) {
  return spatialPrecisions.indexOf(precision)
}

export function validateEventDataset(
  input: EventDatasetInput,
  placeDataset: LoadedPlaceDataset,
): LoadedEventDataset {
  const errors: EventDataIssue[] = []
  const datasetPath = input.datasetPath ?? 'src/data/sample-draft/t05-events'
  const manifest = validateManifest(input.manifest, datasetPath, errors)
  const parsedEvents = validateEvents(input.events, errors)
  const placesById = new Map(
    placeDataset.places.map((place) => [place.place_id, place]),
  )
  const placeFeaturesById = new Map(
    placeDataset.featureCollection.features.map((feature) => [
      feature.properties.place_id,
      feature,
    ]),
  )
  const validEvents: HistoricalEvent[] = []
  const features: RenderEventFeature[] = []
  const unmapped = []

  for (const event of parsedEvents) {
    const before = errors.length
    if (event.spatial_precision === 'SU') {
      validEvents.push(event)
      unmapped.push({
        event_id: event.event_id,
        reason: '空间未知（SU），仅进入列表，不生成地图点。',
      })
      continue
    }

    const place = event.place_id ? placesById.get(event.place_id) : undefined
    if (!place) {
      addIssue(
        errors,
        event.event_id,
        files.events,
        'place_id',
        'UNKNOWN_PLACE_REFERENCE',
        'place_id未引用已加载的合法地点。',
      )
      continue
    }
    if (
      spatialRank(event.spatial_precision) <
      spatialRank(place.spatial_precision)
    ) {
      addIssue(
        errors,
        event.event_id,
        files.events,
        'spatial_precision',
        'EVENT_PRECISION_EXCEEDS_PLACE',
        '事件空间精度不得高于关联地点精度。',
      )
      continue
    }

    validEvents.push(event)
    const placeFeature = placeFeaturesById.get(place.place_id)
    if (!placeFeature || ['S4', 'S5'].includes(event.spatial_precision)) {
      unmapped.push({
        event_id: event.event_id,
        reason: `${event.spatial_precision}或关联地点无合法Point，仅进入列表。`,
      })
      continue
    }

    const presentation = eventTypePresentation[event.event_type]
    features.push({
      type: 'Feature',
      id: event.event_id,
      properties: {
        event_id: event.event_id,
        title: event.title,
        event_type: event.event_type,
        event_type_label: presentation.label,
        icon_id: presentation.iconId,
        selected_icon_id: `${presentation.iconId}-selected`,
        time_original_text: event.time_original_text,
        time_precision: event.time_precision,
        spatial_precision: event.spatial_precision,
        place_id: place.place_id,
        sample_notice: 'sample-draft/draft/不可发布，不代表已核验长征史实',
      },
      geometry: placeFeature.geometry,
    })
    if (errors.length !== before) {
      validEvents.pop()
      features.pop()
    }
  }

  return {
    ok: errors.length === 0,
    manifest,
    events: validEvents,
    featureCollection: { type: 'FeatureCollection', features },
    unmapped,
    errors,
  }
}

export function loadT05EventDataset(placeDataset: LoadedPlaceDataset) {
  return validateEventDataset(
    { manifest: manifestJson, events: eventsJson },
    placeDataset,
  )
}
