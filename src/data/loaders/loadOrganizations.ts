import manifestJson from '../sample-draft/t06-pre-organizations/manifest.json'
import organizationsJson from '../sample-draft/t06-pre-organizations/organizations.json'
import {
  organizationEchelons,
  organizationTimePrecisions,
  organizationTypes,
  type LoadedOrganizationDataset,
  type Organization,
  type OrganizationDataIssue,
  type OrganizationDatasetInput,
  type OrganizationDatasetManifest,
  type OrganizationForeignKeyContext,
  type OrganizationForeignKeyResult,
  type ReadonlyOrganizationRegistry,
} from '../../types/organization'

const files = {
  manifest: 'src/data/sample-draft/t06-pre-organizations/manifest.json',
  organizations:
    'src/data/sample-draft/t06-pre-organizations/organizations.json',
} as const

const organizationIdPattern = /^org_[a-z0-9][a-z0-9_-]*$/
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
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
const allowedFields = new Set([...requiredFields, 'description'])

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
  errors: OrganizationDataIssue[],
  recordId: string,
  file: string,
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

function validateManifest(
  value: unknown,
  datasetPath: string,
  errors: OrganizationDataIssue[],
) {
  const id = 'dataset_manifest'
  if (/(^|[/\\])(data-)?published([/\\]|$)/i.test(datasetPath)) {
    addIssue(
      errors,
      id,
      files.manifest,
      'datasetPath',
      'SAMPLE_IN_PUBLISHED_DIRECTORY',
      'sample-draft组织数据不得位于published或data-published目录。',
    )
  }
  if (!isRecord(value)) {
    addIssue(
      errors,
      id,
      files.manifest,
      '$',
      'INVALID_MANIFEST',
      '组织数据集manifest必须为对象。',
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
        id,
        files.manifest,
        field,
        'INVALID_SAMPLE_MANIFEST',
        `${field}必须为${String(expectedValue)}。`,
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
      'manifest data_version必须是非空内部版本字符串。',
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
      'content_note必须明确待核验且不代表正式历史数据。',
    )
  }

  const allowedManifestFields = new Set([
    ...Object.keys(expected),
    'data_version',
    'content_note',
  ])
  for (const field of Object.keys(value)) {
    if (!allowedManifestFields.has(field)) {
      addIssue(
        errors,
        id,
        files.manifest,
        field,
        'UNKNOWN_MANIFEST_FIELD',
        `manifest包含未定义字段${field}。`,
      )
    }
  }

  return value as unknown as OrganizationDatasetManifest
}

function validateTimeCombination(
  candidate: Record<string, unknown>,
  recordId: string,
  errors: OrganizationDataIssue[],
) {
  const precision = candidate.time_precision
  const start = candidate.valid_from
  const end = candidate.valid_to
  const startParts = start === null ? null : dateParts(start)
  const endParts = end === null ? null : dateParts(end)

  if (start !== null && !startParts) {
    addIssue(
      errors,
      recordId,
      files.organizations,
      'valid_from',
      'INVALID_DATE_FORMAT',
      'valid_from必须为真实存在的YYYY-MM-DD日期或null。',
    )
  }
  if (end !== null && !endParts) {
    addIssue(
      errors,
      recordId,
      files.organizations,
      'valid_to',
      'INVALID_DATE_FORMAT',
      'valid_to必须为真实存在的YYYY-MM-DD日期或null。',
    )
  }
  if (startParts && endParts && String(end) < String(start)) {
    addIssue(
      errors,
      recordId,
      files.organizations,
      'valid_to',
      'REVERSED_DATE_RANGE',
      'valid_to不得早于valid_from。',
    )
  }
  if (!isOneOf(precision, organizationTimePrecisions)) {
    return
  }
  if (precision === 'T0') {
    addIssue(
      errors,
      recordId,
      files.organizations,
      'time_precision',
      'T0_NOT_REPRESENTABLE_BY_ORGANIZATION_CONTRACT',
      'organization的date字段且无原时间文本，当前契约无法无损表达T0。',
    )
    return
  }
  if (precision === 'T6') {
    addIssue(
      errors,
      recordId,
      files.organizations,
      'time_precision',
      'T6_NOT_REPRESENTABLE_BY_ORGANIZATION_CONTRACT',
      'organization当前契约缺少sequence_only及组织顺序语义，无法表达T6。',
    )
    return
  }
  if (precision === 'TU') {
    if (start !== null || end !== null) {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'valid_from,valid_to',
        'INVALID_TIME_COMBINATION',
        'TU必须使用valid_from=null且valid_to=null。',
      )
    }
    if (
      typeof candidate.description !== 'string' ||
      !candidate.description.includes('待')
    ) {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'description',
        'TU_DESCRIPTION_REQUIRED',
        'TU记录的description必须明确有效期待核验或未知。',
      )
    }
    return
  }
  if (!startParts || !endParts) {
    addIssue(
      errors,
      recordId,
      files.organizations,
      'valid_from,valid_to',
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
      files.organizations,
      'valid_from,valid_to',
      'INVALID_TIME_COMBINATION',
      `${precision}的日期边界与冻结精度规则不一致。`,
    )
  }
}

function validateOrganizations(
  value: unknown,
  manifest: OrganizationDatasetManifest | null,
  errors: OrganizationDataIssue[],
) {
  if (!Array.isArray(value)) {
    addIssue(
      errors,
      'organizations_collection',
      files.organizations,
      '$',
      'INVALID_ORGANIZATIONS_FILE',
      'organizations.json必须为数组。',
    )
    return []
  }

  const valid: Readonly<Organization>[] = []
  const seenIds = new Set<string>()
  value.forEach((candidate, index) => {
    const fallbackId = `organizations[${index}]`
    if (!isRecord(candidate)) {
      addIssue(
        errors,
        fallbackId,
        files.organizations,
        '$',
        'INVALID_ORGANIZATION_RECORD',
        'organization记录必须为对象。',
      )
      return
    }
    const recordId =
      typeof candidate.organization_id === 'string'
        ? candidate.organization_id
        : fallbackId
    const before = errors.length

    for (const field of requiredFields) {
      if (!(field in candidate)) {
        addIssue(
          errors,
          recordId,
          files.organizations,
          field,
          'MISSING_REQUIRED_FIELD',
          `${field}是必填字段；允许null也不得省略。`,
        )
      }
    }
    for (const field of Object.keys(candidate)) {
      if (!allowedFields.has(field)) {
        addIssue(
          errors,
          recordId,
          files.organizations,
          field,
          'UNKNOWN_OR_PROHIBITED_FIELD',
          `${field}不是organization基线字段。`,
        )
      }
    }

    if (
      typeof candidate.organization_id !== 'string' ||
      !organizationIdPattern.test(candidate.organization_id)
    ) {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'organization_id',
        'INVALID_ORGANIZATION_ID',
        'organization_id必须为非空且符合org_稳定ID规则。',
      )
    } else if (seenIds.has(candidate.organization_id)) {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'organization_id',
        'DUPLICATE_ORGANIZATION_ID',
        'organization_id在注册表中重复，不得覆盖已有记录。',
      )
    } else {
      seenIds.add(candidate.organization_id)
    }

    if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'name',
        'INVALID_NAME',
        'name去除首尾空白后必须非空。',
      )
    }
    if (!isOneOf(candidate.organization_type, organizationTypes)) {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'organization_type',
        'INVALID_ORGANIZATION_TYPE',
        'organization_type不属于基线枚举。',
      )
    }
    if (
      candidate.echelon !== null &&
      !isOneOf(candidate.echelon, organizationEchelons)
    ) {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'echelon',
        'INVALID_ECHELON',
        'echelon必须为基线枚举或null。',
      )
    }
    if (
      candidate.organization_type === 'military' &&
      candidate.echelon === null
    ) {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'echelon',
        'MILITARY_ECHELON_REQUIRED',
        '军事组织必须填写合法建制层级。',
      )
    }
    if (!isOneOf(candidate.time_precision, organizationTimePrecisions)) {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'time_precision',
        'INVALID_TIME_PRECISION',
        'time_precision必须为T0—TU基线枚举。',
      )
    }
    validateTimeCombination(candidate, recordId, errors)

    if (
      candidate.description !== undefined &&
      candidate.description !== null &&
      typeof candidate.description !== 'string'
    ) {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'description',
        'INVALID_DESCRIPTION',
        'description只能省略、使用字符串或null。',
      )
    }
    if (candidate.review_status !== 'draft') {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'review_status',
        'INVALID_REVIEW_STATUS',
        '当前organization记录只能为draft。',
      )
    }
    if (!isIsoDateTime(candidate.created_at)) {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'created_at',
        'INVALID_CREATED_AT',
        'created_at必须为合法ISO 8601 datetime。',
      )
    }
    if (!isIsoDateTime(candidate.updated_at)) {
      addIssue(
        errors,
        recordId,
        files.organizations,
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
        recordId,
        files.organizations,
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
        recordId,
        files.organizations,
        'data_version',
        'INVALID_DATA_VERSION',
        'data_version必须为非空字符串。',
      )
    } else if (manifest && candidate.data_version !== manifest.data_version) {
      addIssue(
        errors,
        recordId,
        files.organizations,
        'data_version',
        'DATA_VERSION_MISMATCH',
        'organization data_version必须与manifest一致。',
      )
    }

    if (errors.length === before) {
      valid.push(
        Object.freeze({ ...candidate }) as unknown as Readonly<Organization>,
      )
    }
  })
  return valid
}

class OrganizationRegistry implements ReadonlyOrganizationRegistry {
  readonly #byId: ReadonlyMap<string, Readonly<Organization>>

  constructor(organizations: readonly Readonly<Organization>[]) {
    this.#byId = new Map(
      organizations.map((organization) => [
        organization.organization_id,
        organization,
      ]),
    )
  }

  get size() {
    return this.#byId.size
  }

  findById(organizationId: string) {
    return this.#byId.get(organizationId)
  }

  require(
    organizationId: string,
    context: OrganizationForeignKeyContext,
  ): OrganizationForeignKeyResult {
    const organization = this.findById(organizationId)
    if (organization) {
      return { ok: true, organization }
    }
    return {
      ok: false,
      error: {
        file: context.file,
        record_id: context.recordId,
        field: context.field ?? 'organization_id',
        error_code: 'ORGANIZATION_NOT_FOUND',
        message: `organization_id ${organizationId}未引用当前合法组织注册表中的记录。`,
      },
    }
  }
}

export function validateOrganizationDataset(
  input: OrganizationDatasetInput,
): LoadedOrganizationDataset {
  const errors: OrganizationDataIssue[] = []
  const datasetPath =
    input.datasetPath ?? 'src/data/sample-draft/t06-pre-organizations'
  const manifest = validateManifest(input.manifest, datasetPath, errors)
  const organizations = validateOrganizations(
    input.organizations,
    manifest,
    errors,
  )

  return {
    ok: errors.length === 0,
    manifest,
    organizations: Object.freeze([...organizations]),
    registry: new OrganizationRegistry(organizations),
    errors,
  }
}

export function loadT06PreOrganizationDataset() {
  return validateOrganizationDataset({
    manifest: manifestJson,
    organizations: organizationsJson,
  })
}
