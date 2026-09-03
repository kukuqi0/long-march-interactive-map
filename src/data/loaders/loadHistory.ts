import aggregateMembersJson from '../sample-draft/t11-pre-history/aggregate-members.json'
import claimsJson from '../sample-draft/t11-pre-history/claims.json'
import disputesJson from '../sample-draft/t11-pre-history/disputes.json'
import evidenceLinksJson from '../sample-draft/t11-pre-history/evidence-links.json'
import manifestJson from '../sample-draft/t11-pre-history/manifest.json'
import organizationRelationsJson from '../sample-draft/t11-pre-history/organization-relations.json'
import sourcesJson from '../sample-draft/t11-pre-history/sources.json'
import { timePrecisions } from '../../types/event'
import {
  aggregateMappingTypes,
  claimConfidences,
  claimDataStates,
  claimObjectTypes,
  claimPredicates,
  claimSubjectTypes,
  disputeStatuses,
  disputeTypes,
  evidenceRelations,
  organizationRelationTypes,
  sourceQualities,
  sourceTypes,
  type AggregateMemberMapping,
  type Claim,
  type EvidenceLink,
  type Dispute,
  type HistoryDataIssue,
  type HistoryDatasetInput,
  type HistoryDatasetManifest,
  type HistoryDependencies,
  type LoadedHistoryDataset,
  type OrganizationNameResolution,
  type OrganizationRelation,
  type OrganizationMatchSource,
  type ReadonlyAggregateMembershipIndex,
  type Source,
} from '../../types/history'
import { spatialPrecisions } from '../../types/place'
import type { Organization } from '../../types/organization'
import { isIsoCalendarDate } from '../../utils/timeFilter'

const datasetVersion = 'v0.2-t12-structural-dispute-sample-draft'
const files = {
  manifest: 'src/data/sample-draft/t11-pre-history/manifest.json',
  organizationRelations:
    'src/data/sample-draft/t11-pre-history/organization-relations.json',
  claims: 'src/data/sample-draft/t11-pre-history/claims.json',
  disputes: 'src/data/sample-draft/t11-pre-history/disputes.json',
  sources: 'src/data/sample-draft/t11-pre-history/sources.json',
  evidenceLinks: 'src/data/sample-draft/t11-pre-history/evidence-links.json',
  aggregateMembers:
    'src/data/sample-draft/t11-pre-history/aggregate-members.json',
} as const

const stableIdPatterns = {
  relation: /^rel_[a-z0-9][a-z0-9_-]*$/,
  claim: /^claim_[a-z0-9][a-z0-9_-]*$/,
  source: /^src_[a-z0-9][a-z0-9_-]*$/,
  evidence: /^ev_[a-z0-9][a-z0-9_-]*$/,
  dispute: /^dispute_[a-z0-9][a-z0-9_-]*$/,
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === 'string' && values.includes(value)
}

function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.includes('T') &&
    Number.isFinite(Date.parse(value))
  )
}

function addIssue(
  errors: HistoryDataIssue[],
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

function validateShape(
  candidate: Record<string, unknown>,
  recordId: string,
  file: string,
  required: readonly string[],
  allowed: ReadonlySet<string>,
  errors: HistoryDataIssue[],
) {
  for (const field of required) {
    if (!(field in candidate)) {
      addIssue(
        errors,
        file,
        recordId,
        field,
        'MISSING_REQUIRED_FIELD',
        `${field}是必填字段；允许null也不得省略。`,
      )
    }
  }
  for (const field of Object.keys(candidate)) {
    if (!allowed.has(field)) {
      addIssue(
        errors,
        file,
        recordId,
        field,
        'UNKNOWN_FIELD',
        `${field}不是冻结数据字典中的字段。`,
      )
    }
  }
}

function validateCommon(
  candidate: Record<string, unknown>,
  recordId: string,
  file: string,
  manifest: HistoryDatasetManifest | null,
  errors: HistoryDataIssue[],
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
    candidate.updated_at < candidate.created_at
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
      'data_version必须为非空内部版本。',
    )
  } else if (manifest && candidate.data_version !== manifest.data_version) {
    addIssue(
      errors,
      file,
      recordId,
      'data_version',
      'DATA_VERSION_MISMATCH',
      '记录data_version必须与manifest一致。',
    )
  }
  if (candidate.review_status !== 'draft') {
    addIssue(
      errors,
      file,
      recordId,
      'review_status',
      'INVALID_REVIEW_STATUS',
      '当前历史样例记录必须保持draft。',
    )
  }
}

function validateManifest(
  value: unknown,
  datasetPath: string,
  errors: HistoryDataIssue[],
) {
  const id = 'dataset_manifest'
  if (/(^|[/\\])(data-)?published([/\\]|$)/i.test(datasetPath)) {
    addIssue(
      errors,
      files.manifest,
      id,
      'datasetPath',
      'SAMPLE_IN_PUBLISHED_DIRECTORY',
      'sample-draft历史证据数据不得位于发布目录。',
    )
  }
  if (!isRecord(value)) {
    addIssue(
      errors,
      files.manifest,
      id,
      '$',
      'INVALID_MANIFEST',
      'manifest必须为对象。',
    )
    return null
  }
  const expected = {
    dataset_tier: 'sample-draft',
    is_sample: true,
    publication_allowed: false,
    review_status: 'draft',
    data_version: datasetVersion,
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
  if (
    typeof value.content_note !== 'string' ||
    !value.content_note.includes('draft') ||
    !value.content_note.includes('不可发布')
  ) {
    addIssue(
      errors,
      files.manifest,
      id,
      'content_note',
      'INVALID_CONTENT_NOTE',
      'content_note必须明确draft可追溯性和不可发布边界。',
    )
  }
  const allowed = new Set([...Object.keys(expected), 'content_note'])
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      addIssue(
        errors,
        files.manifest,
        id,
        field,
        'UNKNOWN_MANIFEST_FIELD',
        `manifest包含未定义字段${field}。`,
      )
    }
  }
  return value as unknown as HistoryDatasetManifest
}

function parseCollection<T>(
  value: unknown,
  file: string,
  collectionName: string,
  errors: HistoryDataIssue[],
  validate: (
    candidate: Record<string, unknown>,
    index: number,
    errors: HistoryDataIssue[],
  ) => T | null,
) {
  if (!Array.isArray(value)) {
    addIssue(
      errors,
      file,
      `${collectionName}_collection`,
      '$',
      'INVALID_COLLECTION',
      `${collectionName}必须为数组。`,
    )
    return []
  }
  return value.flatMap((candidate, index) => {
    if (!isRecord(candidate)) {
      addIssue(
        errors,
        file,
        `${collectionName}[${index}]`,
        '$',
        'INVALID_RECORD',
        `${collectionName}记录必须为对象。`,
      )
      return []
    }
    const record = validate(candidate, index, errors)
    return record ? [record] : []
  })
}

function validateStableId(
  value: unknown,
  pattern: RegExp,
  field: string,
  recordId: string,
  file: string,
  seen: Set<string>,
  errors: HistoryDataIssue[],
) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    addIssue(
      errors,
      file,
      recordId,
      field,
      'INVALID_STABLE_ID',
      `${field}不符合稳定ID规则。`,
    )
    return
  }
  if (seen.has(value)) {
    addIssue(
      errors,
      file,
      recordId,
      field,
      'DUPLICATE_STABLE_ID',
      `${field}在数据集中重复。`,
    )
  }
  seen.add(value)
}

function parseRelations(
  value: unknown,
  manifest: HistoryDatasetManifest | null,
  errors: HistoryDataIssue[],
) {
  const required = [
    'relation_id',
    'subject_organization_id',
    'relation_type',
    'object_organization_id',
    'valid_from',
    'valid_to',
    'time_precision',
    'claim_id',
    'review_status',
    'created_at',
    'updated_at',
    'data_version',
  ] as const
  const allowed = new Set(required)
  const seen = new Set<string>()
  return parseCollection(
    value,
    files.organizationRelations,
    'organization_relations',
    errors,
    (candidate, index) => {
      const id =
        typeof candidate.relation_id === 'string'
          ? candidate.relation_id
          : `organization_relations[${index}]`
      const before = errors.length
      validateShape(
        candidate,
        id,
        files.organizationRelations,
        required,
        allowed,
        errors,
      )
      validateCommon(
        candidate,
        id,
        files.organizationRelations,
        manifest,
        errors,
      )
      validateStableId(
        candidate.relation_id,
        stableIdPatterns.relation,
        'relation_id',
        id,
        files.organizationRelations,
        seen,
        errors,
      )
      if (!isOneOf(candidate.relation_type, organizationRelationTypes)) {
        addIssue(
          errors,
          files.organizationRelations,
          id,
          'relation_type',
          'INVALID_RELATION_TYPE',
          'relation_type不属于冻结枚举。',
        )
      }
      for (const field of [
        'subject_organization_id',
        'object_organization_id',
        'claim_id',
      ] as const) {
        if (typeof candidate[field] !== 'string' || !candidate[field].trim()) {
          addIssue(
            errors,
            files.organizationRelations,
            id,
            field,
            'INVALID_REFERENCE_ID',
            `${field}必须为非空稳定ID。`,
          )
        }
      }
      for (const field of ['valid_from', 'valid_to'] as const) {
        if (
          candidate[field] !== null &&
          (typeof candidate[field] !== 'string' ||
            !isIsoCalendarDate(candidate[field]))
        ) {
          addIssue(
            errors,
            files.organizationRelations,
            id,
            field,
            'INVALID_DATE',
            `${field}必须为真实YYYY-MM-DD日期或null。`,
          )
        }
      }
      if (
        typeof candidate.valid_from === 'string' &&
        typeof candidate.valid_to === 'string' &&
        candidate.valid_from >= candidate.valid_to
      ) {
        addIssue(
          errors,
          files.organizationRelations,
          id,
          'valid_to',
          'INVALID_HALF_OPEN_RANGE',
          '半开区间要求valid_from严格早于valid_to。',
        )
      }
      if (!isOneOf(candidate.time_precision, timePrecisions)) {
        addIssue(
          errors,
          files.organizationRelations,
          id,
          'time_precision',
          'INVALID_TIME_PRECISION',
          'time_precision必须为T0—TU枚举。',
        )
      }
      if (
        candidate.subject_organization_id ===
          candidate.object_organization_id &&
        candidate.relation_type !== 'renamed_to'
      ) {
        addIssue(
          errors,
          files.organizationRelations,
          id,
          'object_organization_id',
          'SELF_RELATION_NOT_ALLOWED',
          '仅renamed_to允许subject与object使用同一organization ID。',
        )
      }
      return errors.length === before
        ? (Object.freeze({
            ...candidate,
          }) as unknown as Readonly<OrganizationRelation>)
        : null
    },
  )
}

function parseClaims(
  value: unknown,
  manifest: HistoryDatasetManifest | null,
  errors: HistoryDataIssue[],
) {
  const required = [
    'claim_id',
    'subject_type',
    'subject_id',
    'predicate',
    'object_type',
    'object_value',
    'claim_data_state',
    'time_precision',
    'spatial_precision',
    'claim_confidence',
    'review_status',
    'created_at',
    'updated_at',
    'data_version',
  ] as const
  const allowed = new Set(required)
  const seen = new Set<string>()
  return parseCollection(
    value,
    files.claims,
    'claims',
    errors,
    (candidate, index) => {
      const id =
        typeof candidate.claim_id === 'string'
          ? candidate.claim_id
          : `claims[${index}]`
      const before = errors.length
      validateShape(candidate, id, files.claims, required, allowed, errors)
      validateCommon(candidate, id, files.claims, manifest, errors)
      validateStableId(
        candidate.claim_id,
        stableIdPatterns.claim,
        'claim_id',
        id,
        files.claims,
        seen,
        errors,
      )
      if (!isOneOf(candidate.subject_type, claimSubjectTypes))
        addIssue(
          errors,
          files.claims,
          id,
          'subject_type',
          'INVALID_SUBJECT_TYPE',
          'subject_type不属于冻结枚举。',
        )
      if (
        typeof candidate.subject_id !== 'string' ||
        !candidate.subject_id.trim()
      )
        addIssue(
          errors,
          files.claims,
          id,
          'subject_id',
          'INVALID_SUBJECT_ID',
          'subject_id必须为非空稳定ID。',
        )
      if (!isOneOf(candidate.predicate, claimPredicates))
        addIssue(
          errors,
          files.claims,
          id,
          'predicate',
          'UNKNOWN_PREDICATE',
          'predicate不属于本批受控谓词集合。',
        )
      if (!isOneOf(candidate.object_type, claimObjectTypes))
        addIssue(
          errors,
          files.claims,
          id,
          'object_type',
          'INVALID_OBJECT_TYPE',
          'object_type不属于冻结枚举。',
        )
      if (
        candidate.object_value !== null &&
        (typeof candidate.object_value !== 'string' ||
          !candidate.object_value.trim())
      )
        addIssue(
          errors,
          files.claims,
          id,
          'object_value',
          'INVALID_OBJECT_VALUE',
          'object_value必须为非空字符串或null。',
        )
      if (!isOneOf(candidate.claim_data_state, claimDataStates))
        addIssue(
          errors,
          files.claims,
          id,
          'claim_data_state',
          'INVALID_CLAIM_DATA_STATE',
          'claim_data_state不属于冻结枚举。',
        )
      if (
        candidate.time_precision !== null &&
        !isOneOf(candidate.time_precision, timePrecisions)
      )
        addIssue(
          errors,
          files.claims,
          id,
          'time_precision',
          'INVALID_TIME_PRECISION',
          'time_precision必须为T0—TU或null。',
        )
      if (
        candidate.spatial_precision !== null &&
        !isOneOf(candidate.spatial_precision, spatialPrecisions)
      )
        addIssue(
          errors,
          files.claims,
          id,
          'spatial_precision',
          'INVALID_SPATIAL_PRECISION',
          'spatial_precision必须为S0—SU或null。',
        )
      if (!isOneOf(candidate.claim_confidence, claimConfidences))
        addIssue(
          errors,
          files.claims,
          id,
          'claim_confidence',
          'INVALID_CLAIM_CONFIDENCE',
          'claim_confidence不属于冻结枚举。',
        )
      if (
        candidate.predicate === 'had_name' &&
        !(
          candidate.subject_type === 'place' &&
          candidate.object_type === 'literal'
        )
      )
        addIssue(
          errors,
          files.claims,
          id,
          'predicate',
          'INVALID_HAD_NAME_SHAPE',
          'had_name仅允许place→literal historical name。',
        )
      if (
        candidate.predicate === 'had_participant' &&
        !(
          candidate.subject_type === 'event' &&
          candidate.object_type === 'entity'
        )
      )
        addIssue(
          errors,
          files.claims,
          id,
          'predicate',
          'INVALID_HAD_PARTICIPANT_SHAPE',
          'had_participant仅允许event→entity。',
        )
      if (
        candidate.predicate === 'renamed_to' &&
        !(
          candidate.subject_type === 'organization' &&
          candidate.object_type === 'literal'
        )
      )
        addIssue(
          errors,
          files.claims,
          id,
          'predicate',
          'INVALID_RENAMED_TO_SHAPE',
          'renamed_to名称命题仅允许organization→literal。',
        )
      if (
        candidate.predicate === 'route_geometry_variant' &&
        !(
          candidate.subject_type === 'route_segment' &&
          candidate.object_type === 'geometry' &&
          candidate.claim_data_state === 'disputed' &&
          candidate.claim_confidence === 'C-D'
        )
      )
        addIssue(
          errors,
          files.claims,
          id,
          'predicate',
          'INVALID_ROUTE_GEOMETRY_VARIANT_SHAPE',
          'route_geometry_variant仅允许route_segment→geometry的C-D disputed结构命题。',
        )
      return errors.length === before
        ? (Object.freeze({ ...candidate }) as unknown as Readonly<Claim>)
        : null
    },
  )
}

function parseDisputes(
  value: unknown,
  manifest: HistoryDatasetManifest | null,
  errors: HistoryDataIssue[],
) {
  const required = [
    'dispute_id',
    'title',
    'dispute_type',
    'dispute_status',
    'competing_claim_ids',
    'adopted_claim_id',
    'editorial_note',
    'review_status',
    'created_at',
    'updated_at',
    'data_version',
  ] as const
  const allowed = new Set(required)
  const seen = new Set<string>()
  return parseCollection(
    value,
    files.disputes,
    'disputes',
    errors,
    (candidate, index) => {
      const id =
        typeof candidate.dispute_id === 'string'
          ? candidate.dispute_id
          : `disputes[${index}]`
      const before = errors.length
      validateShape(candidate, id, files.disputes, required, allowed, errors)
      validateCommon(candidate, id, files.disputes, manifest, errors)
      validateStableId(
        candidate.dispute_id,
        stableIdPatterns.dispute,
        'dispute_id',
        id,
        files.disputes,
        seen,
        errors,
      )
      if (typeof candidate.title !== 'string' || !candidate.title.trim())
        addIssue(
          errors,
          files.disputes,
          id,
          'title',
          'INVALID_TITLE',
          'title必须为非空字符串。',
        )
      if (!isOneOf(candidate.dispute_type, disputeTypes))
        addIssue(
          errors,
          files.disputes,
          id,
          'dispute_type',
          'INVALID_DISPUTE_TYPE',
          'dispute_type不属于冻结枚举。',
        )
      if (!isOneOf(candidate.dispute_status, disputeStatuses))
        addIssue(
          errors,
          files.disputes,
          id,
          'dispute_status',
          'INVALID_DISPUTE_STATUS',
          'dispute_status不属于D0—D5。',
        )
      if (
        !Array.isArray(candidate.competing_claim_ids) ||
        candidate.competing_claim_ids.length < 2 ||
        !candidate.competing_claim_ids.every(
          (claimId) => typeof claimId === 'string' && claimId.trim(),
        )
      )
        addIssue(
          errors,
          files.disputes,
          id,
          'competing_claim_ids',
          'INVALID_COMPETING_CLAIMS',
          'competing_claim_ids必须包含至少两个非空claim ID。',
        )
      if (
        Array.isArray(candidate.competing_claim_ids) &&
        new Set(candidate.competing_claim_ids).size !==
          candidate.competing_claim_ids.length
      )
        addIssue(
          errors,
          files.disputes,
          id,
          'competing_claim_ids',
          'DUPLICATE_COMPETING_CLAIM',
          '竞争claim不得重复。',
        )
      if (
        candidate.adopted_claim_id !== null &&
        (typeof candidate.adopted_claim_id !== 'string' ||
          !candidate.adopted_claim_id.trim())
      )
        addIssue(
          errors,
          files.disputes,
          id,
          'adopted_claim_id',
          'INVALID_ADOPTED_CLAIM',
          'adopted_claim_id必须为非空claim ID或null。',
        )
      if (
        typeof candidate.adopted_claim_id === 'string' &&
        Array.isArray(candidate.competing_claim_ids) &&
        !candidate.competing_claim_ids.includes(candidate.adopted_claim_id)
      )
        addIssue(
          errors,
          files.disputes,
          id,
          'adopted_claim_id',
          'ADOPTED_CLAIM_NOT_COMPETING',
          '采纳claim必须属于竞争claim集合。',
        )
      if (
        candidate.dispute_status === 'D2' &&
        candidate.adopted_claim_id !== null
      )
        addIssue(
          errors,
          files.disputes,
          id,
          'adopted_claim_id',
          'UNRESOLVED_DISPUTE_CANNOT_ADOPT',
          'D2实质争议未解决时不得采纳方案。',
        )
      if (
        candidate.dispute_status === 'D3' &&
        candidate.adopted_claim_id === null
      )
        addIssue(
          errors,
          files.disputes,
          id,
          'adopted_claim_id',
          'TEMPORARY_ADOPTION_REQUIRED',
          'D3暂采一说必须设置属于竞争集合的adopted_claim_id。',
        )
      if (
        candidate.dispute_status === 'D4' &&
        candidate.adopted_claim_id !== null
      )
        addIssue(
          errors,
          files.disputes,
          id,
          'adopted_claim_id',
          'PARALLEL_DISPUTE_CANNOT_ADOPT',
          'D4并列展示不得设置默认采纳声明。',
        )
      if (
        typeof candidate.editorial_note !== 'string' ||
        !candidate.editorial_note.includes('结构测试') ||
        !candidate.editorial_note.includes('不得用于发布')
      )
        addIssue(
          errors,
          files.disputes,
          id,
          'editorial_note',
          'INVALID_STRUCTURAL_DISPUTE_NOTE',
          '结构争议样例必须明确测试性质和不可发布边界。',
        )
      return errors.length === before
        ? (Object.freeze({
            ...candidate,
            competing_claim_ids: Object.freeze([
              ...(candidate.competing_claim_ids as string[]),
            ]),
          }) as unknown as Readonly<Dispute>)
        : null
    },
  )
}

function parseSources(
  value: unknown,
  manifest: HistoryDatasetManifest | null,
  errors: HistoryDataIssue[],
) {
  const required = [
    'source_id',
    'source_type',
    'title',
    'creator',
    'edition',
    'publication_year',
    'publisher_or_archive',
    'source_quality',
    'review_status',
    'created_at',
    'updated_at',
    'data_version',
  ] as const
  const allowed = new Set([...required, 'public_url', 'file_location'])
  const seen = new Set<string>()
  return parseCollection(
    value,
    files.sources,
    'sources',
    errors,
    (candidate, index) => {
      const id =
        typeof candidate.source_id === 'string'
          ? candidate.source_id
          : `sources[${index}]`
      const before = errors.length
      validateShape(candidate, id, files.sources, required, allowed, errors)
      validateCommon(candidate, id, files.sources, manifest, errors)
      validateStableId(
        candidate.source_id,
        stableIdPatterns.source,
        'source_id',
        id,
        files.sources,
        seen,
        errors,
      )
      if (!isOneOf(candidate.source_type, sourceTypes))
        addIssue(
          errors,
          files.sources,
          id,
          'source_type',
          'INVALID_SOURCE_TYPE',
          'source_type不属于ST1—ST10。',
        )
      if (!isOneOf(candidate.source_quality, sourceQualities))
        addIssue(
          errors,
          files.sources,
          id,
          'source_quality',
          'INVALID_SOURCE_QUALITY',
          'source_quality不属于Q1—QX。',
        )
      if (typeof candidate.title !== 'string' || !candidate.title.trim())
        addIssue(
          errors,
          files.sources,
          id,
          'title',
          'INVALID_TITLE',
          'title必须为非空字符串。',
        )
      for (const field of [
        'creator',
        'edition',
        'publisher_or_archive',
        'file_location',
      ] as const) {
        if (
          field in candidate &&
          candidate[field] !== null &&
          (typeof candidate[field] !== 'string' || !candidate[field].trim())
        )
          addIssue(
            errors,
            files.sources,
            id,
            field,
            'INVALID_NULLABLE_STRING',
            `${field}必须为非空字符串或null。`,
          )
      }
      if ('public_url' in candidate && candidate.public_url !== null) {
        try {
          const url = new URL(String(candidate.public_url))
          if (url.protocol !== 'https:') throw new Error('not https')
        } catch {
          addIssue(
            errors,
            files.sources,
            id,
            'public_url',
            'INVALID_PUBLIC_URL',
            'public_url必须为canonical HTTPS URL或null。',
          )
        }
      }
      if (
        candidate.publication_year !== null &&
        (!Number.isInteger(candidate.publication_year) ||
          Number(candidate.publication_year) < 1000 ||
          Number(candidate.publication_year) > 9999)
      )
        addIssue(
          errors,
          files.sources,
          id,
          'publication_year',
          'INVALID_PUBLICATION_YEAR',
          'publication_year必须为四位整数或null。',
        )
      return errors.length === before
        ? (Object.freeze({ ...candidate }) as unknown as Readonly<Source>)
        : null
    },
  )
}

function parseEvidenceLinks(
  value: unknown,
  manifest: HistoryDatasetManifest | null,
  errors: HistoryDataIssue[],
) {
  const required = [
    'evidence_link_id',
    'claim_id',
    'source_id',
    'evidence_relation',
    'locator',
    'excerpt',
    'interpretation_note',
    'review_status',
    'created_at',
    'updated_at',
    'data_version',
  ] as const
  const allowed = new Set(required)
  const seen = new Set<string>()
  return parseCollection(
    value,
    files.evidenceLinks,
    'evidence_links',
    errors,
    (candidate, index) => {
      const id =
        typeof candidate.evidence_link_id === 'string'
          ? candidate.evidence_link_id
          : `evidence_links[${index}]`
      const before = errors.length
      validateShape(
        candidate,
        id,
        files.evidenceLinks,
        required,
        allowed,
        errors,
      )
      validateCommon(candidate, id, files.evidenceLinks, manifest, errors)
      validateStableId(
        candidate.evidence_link_id,
        stableIdPatterns.evidence,
        'evidence_link_id',
        id,
        files.evidenceLinks,
        seen,
        errors,
      )
      if (typeof candidate.claim_id !== 'string' || !candidate.claim_id.trim())
        addIssue(
          errors,
          files.evidenceLinks,
          id,
          'claim_id',
          'INVALID_CLAIM_ID',
          'claim_id必须为非空稳定ID。',
        )
      if (
        typeof candidate.source_id !== 'string' ||
        !candidate.source_id.trim()
      )
        addIssue(
          errors,
          files.evidenceLinks,
          id,
          'source_id',
          'INVALID_SOURCE_ID',
          'source_id必须为非空稳定ID。',
        )
      else if (!stableIdPatterns.source.test(candidate.source_id))
        addIssue(
          errors,
          files.evidenceLinks,
          id,
          'source_id',
          'INVALID_SOURCE_ID_PREFIX',
          'source_id必须使用03号冻结字典规定的src_前缀。',
        )
      if (!isOneOf(candidate.evidence_relation, evidenceRelations))
        addIssue(
          errors,
          files.evidenceLinks,
          id,
          'evidence_relation',
          'INVALID_EVIDENCE_RELATION',
          'evidence_relation不属于supports/contradicts/background。',
        )
      for (const field of [
        'locator',
        'excerpt',
        'interpretation_note',
      ] as const) {
        if (
          candidate[field] !== null &&
          (typeof candidate[field] !== 'string' || !candidate[field].trim())
        )
          addIssue(
            errors,
            files.evidenceLinks,
            id,
            field,
            'INVALID_NULLABLE_STRING',
            `${field}必须为非空字符串或null；发布定位门槛由统一校验规则判断。`,
          )
      }
      return errors.length === before
        ? (Object.freeze({ ...candidate }) as unknown as Readonly<EvidenceLink>)
        : null
    },
  )
}

function parseAggregateMembers(
  value: unknown,
  dependencies: HistoryDependencies,
  errors: HistoryDataIssue[],
) {
  const required = ['aggregate_id', 'member_id', 'mapping_type'] as const
  const allowed = new Set(required)
  const seen = new Set<string>()
  return parseCollection(
    value,
    files.aggregateMembers,
    'aggregate_members',
    errors,
    (candidate, index) => {
      const id = `${String(candidate.aggregate_id ?? `aggregate_members[${index}]`)}→${String(candidate.member_id ?? '?')}`
      const before = errors.length
      validateShape(
        candidate,
        id,
        files.aggregateMembers,
        required,
        allowed,
        errors,
      )
      if (!isOneOf(candidate.mapping_type, aggregateMappingTypes))
        addIssue(
          errors,
          files.aggregateMembers,
          id,
          'mapping_type',
          'INVALID_MAPPING_TYPE',
          'mapping_type必须为product_editorial_aggregate_member。',
        )
      for (const field of ['aggregate_id', 'member_id'] as const) {
        if (
          typeof candidate[field] !== 'string' ||
          !dependencies.organizations.registry.findById(candidate[field])
        )
          addIssue(
            errors,
            files.aggregateMembers,
            id,
            field,
            'ORGANIZATION_NOT_FOUND',
            `${field}必须引用实际organization。`,
          )
      }
      if (candidate.aggregate_id === candidate.member_id)
        addIssue(
          errors,
          files.aggregateMembers,
          id,
          'member_id',
          'RECURSIVE_AGGREGATE_MAPPING',
          '产品聚合成员映射不得自指。',
        )
      const key = `${String(candidate.aggregate_id)}\0${String(candidate.member_id)}`
      if (seen.has(key))
        addIssue(
          errors,
          files.aggregateMembers,
          id,
          '$',
          'DUPLICATE_AGGREGATE_MAPPING',
          '产品聚合成员映射重复。',
        )
      seen.add(key)
      return errors.length === before
        ? (Object.freeze({
            ...candidate,
          }) as unknown as Readonly<AggregateMemberMapping>)
        : null
    },
  )
}

class AggregateMembershipIndex implements ReadonlyAggregateMembershipIndex {
  readonly #members: ReadonlyMap<string, readonly string[]>
  readonly size: number

  constructor(mappings: readonly Readonly<AggregateMemberMapping>[]) {
    const mutable = new Map<string, string[]>()
    for (const mapping of mappings) {
      const members = mutable.get(mapping.aggregate_id) ?? []
      members.push(mapping.member_id)
      mutable.set(mapping.aggregate_id, members)
    }
    this.#members = new Map(
      [...mutable].map(([id, members]) => [id, Object.freeze([...members])]),
    )
    this.size = mappings.length
  }

  membersOf(aggregateId: string) {
    return this.#members.get(aggregateId) ?? []
  }

  matchSources(selectedOrganizationId: string, objectOrganizationId: string) {
    const matches: OrganizationMatchSource[] = []
    if (selectedOrganizationId === objectOrganizationId)
      matches.push('direct' as const)
    if (this.membersOf(selectedOrganizationId).includes(objectOrganizationId))
      matches.push('aggregate_member' as const)
    return Object.freeze(matches)
  }
}

function validateForeignKeys(
  dependencies: HistoryDependencies,
  relations: readonly Readonly<OrganizationRelation>[],
  claims: readonly Readonly<Claim>[],
  disputes: readonly Readonly<Dispute>[],
  sources: readonly Readonly<Source>[],
  evidenceLinks: readonly Readonly<EvidenceLink>[],
  errors: HistoryDataIssue[],
) {
  const relationIds = new Set(relations.map((item) => item.relation_id))
  const claimIds = new Set(claims.map((item) => item.claim_id))
  const sourceIds = new Set(sources.map((item) => item.source_id))
  const placeIds = new Set(
    dependencies.places.places.map((item) => item.place_id),
  )
  const eventIds = new Set(
    dependencies.events.events.map((item) => item.event_id),
  )
  const routeSegmentIds = new Set(
    dependencies.routes.routeSegments.map((item) => item.route_segment_id),
  )
  const organizationIds = new Set(
    dependencies.organizations.organizations.map(
      (item) => item.organization_id,
    ),
  )
  const routeFeaturesById = new Map(
    dependencies.routes.featureCollection.features.flatMap((feature) =>
      typeof feature.id === 'string' ? [[feature.id, feature] as const] : [],
    ),
  )
  const entityIds = new Set([
    ...placeIds,
    ...eventIds,
    ...routeSegmentIds,
    ...organizationIds,
    ...relationIds,
  ])

  for (const relation of relations) {
    for (const field of [
      'subject_organization_id',
      'object_organization_id',
    ] as const) {
      if (!organizationIds.has(relation[field]))
        addIssue(
          errors,
          files.organizationRelations,
          relation.relation_id,
          field,
          'ORGANIZATION_NOT_FOUND',
          `${field}未命中实际organization。`,
        )
    }
    if (!claimIds.has(relation.claim_id))
      addIssue(
        errors,
        files.organizationRelations,
        relation.relation_id,
        'claim_id',
        'CLAIM_NOT_FOUND',
        'relation.claim_id未命中实际claim。',
      )
  }

  for (const claim of claims) {
    const subjectExists =
      claim.subject_type === 'organization'
        ? organizationIds.has(claim.subject_id)
        : claim.subject_type === 'place'
          ? placeIds.has(claim.subject_id)
          : claim.subject_type === 'event'
            ? eventIds.has(claim.subject_id)
            : claim.subject_type === 'route_segment'
              ? routeSegmentIds.has(claim.subject_id)
              : claim.subject_type === 'relation'
                ? relationIds.has(claim.subject_id)
                : claim.subject_type === 'topic'
                  ? claim.subject_id === 'topic_long_march_v1'
                  : false
    if (!subjectExists)
      addIssue(
        errors,
        files.claims,
        claim.claim_id,
        'subject_id',
        'SUBJECT_NOT_FOUND',
        'claim多态subject未命中对应实际实体。',
      )
    if (
      claim.object_type === 'entity' &&
      (!claim.object_value || !entityIds.has(claim.object_value))
    )
      addIssue(
        errors,
        files.claims,
        claim.claim_id,
        'object_value',
        'ENTITY_OBJECT_NOT_FOUND',
        'entity object未命中任何实际实体。',
      )
    if (
      claim.predicate === 'had_participant' &&
      (!claim.object_value || !organizationIds.has(claim.object_value))
    )
      addIssue(
        errors,
        files.claims,
        claim.claim_id,
        'object_value',
        'PARTICIPANT_ORGANIZATION_NOT_FOUND',
        'had_participant宾语必须命中实际organization。',
      )
    if (claim.object_type === 'geometry') {
      const feature = claim.object_value
        ? routeFeaturesById.get(claim.object_value)
        : undefined
      if (!feature)
        addIssue(
          errors,
          files.claims,
          claim.claim_id,
          'object_value',
          'GEOMETRY_OBJECT_NOT_FOUND',
          'geometry object必须命中实际GeoJSON Feature ID。',
        )
      else if (
        claim.subject_type !== 'route_segment' ||
        feature.properties.route_segment_id !== claim.subject_id
      )
        addIssue(
          errors,
          files.claims,
          claim.claim_id,
          'object_value',
          'GEOMETRY_SUBJECT_MISMATCH',
          'geometry引用必须属于claim所指route_segment。',
        )
    }
  }

  const claimsById = new Map(claims.map((claim) => [claim.claim_id, claim]))
  for (const dispute of disputes) {
    const competitors = dispute.competing_claim_ids.flatMap((claimId) => {
      const claim = claimsById.get(claimId)
      if (!claim) {
        addIssue(
          errors,
          files.disputes,
          dispute.dispute_id,
          'competing_claim_ids',
          'COMPETING_CLAIM_NOT_FOUND',
          `竞争claim ${claimId} 不存在。`,
        )
        return []
      }
      return [claim]
    })
    if (competitors.length >= 2) {
      const context = `${competitors[0].subject_type}:${competitors[0].subject_id}`
      if (
        competitors.some(
          (claim) => `${claim.subject_type}:${claim.subject_id}` !== context,
        )
      )
        addIssue(
          errors,
          files.disputes,
          dispute.dispute_id,
          'competing_claim_ids',
          'COMPETING_CONTEXT_MISMATCH',
          '竞争claim必须属于同一个被争议主体上下文。',
        )
    }
  }

  for (const historicalName of dependencies.places.historicalNames) {
    if (
      !claimIds.has(historicalName.claim_id) &&
      !historicalName.historical_name_id.includes('_placeholder')
    ) {
      addIssue(
        errors,
        files.claims,
        historicalName.historical_name_id,
        'claim_id',
        'HISTORICAL_NAME_CLAIM_NOT_FOUND',
        '真实historical_place_name.claim_id必须命中实际claim；既有placeholder警告不在本批伪造补链。',
      )
    }
  }

  for (const link of evidenceLinks) {
    if (!claimIds.has(link.claim_id))
      addIssue(
        errors,
        files.evidenceLinks,
        link.evidence_link_id,
        'claim_id',
        'CLAIM_NOT_FOUND',
        'evidence_link.claim_id未命中实际claim。',
      )
    if (!sourceIds.has(link.source_id))
      addIssue(
        errors,
        files.evidenceLinks,
        link.evidence_link_id,
        'source_id',
        'SOURCE_NOT_FOUND',
        'evidence_link.source_id未命中实际source。',
      )
  }
}

export function validateHistoryDataset(
  input: HistoryDatasetInput,
  dependencies: HistoryDependencies,
): LoadedHistoryDataset {
  const errors: HistoryDataIssue[] = []
  const datasetPath =
    input.datasetPath ?? 'src/data/sample-draft/t11-pre-history'
  const manifest = validateManifest(input.manifest, datasetPath, errors)
  const relations = parseRelations(
    input.organizationRelations,
    manifest,
    errors,
  )
  const claims = parseClaims(input.claims, manifest, errors)
  const disputes = parseDisputes(input.disputes, manifest, errors)
  const sources = parseSources(input.sources, manifest, errors)
  const evidenceLinks = parseEvidenceLinks(
    input.evidenceLinks,
    manifest,
    errors,
  )
  const aggregateMembers = parseAggregateMembers(
    input.aggregateMembers,
    dependencies,
    errors,
  )
  validateForeignKeys(
    dependencies,
    relations,
    claims,
    disputes,
    sources,
    evidenceLinks,
    errors,
  )
  const aggregateIndex = new AggregateMembershipIndex(aggregateMembers)
  return {
    ok: errors.length === 0,
    manifest,
    organizationRelations: Object.freeze([...relations]),
    claims: Object.freeze([...claims]),
    disputes: Object.freeze([...disputes]),
    sources: Object.freeze([...sources]),
    evidenceLinks: Object.freeze([...evidenceLinks]),
    aggregateMembers: Object.freeze([...aggregateMembers]),
    aggregateIndex,
    errors: Object.freeze([...errors]),
  }
}

export function loadT11PreHistoryDataset(dependencies: HistoryDependencies) {
  return validateHistoryDataset(
    {
      manifest: manifestJson,
      organizationRelations: organizationRelationsJson,
      claims: claimsJson,
      disputes: disputesJson,
      sources: sourcesJson,
      evidenceLinks: evidenceLinksJson,
      aggregateMembers: aggregateMembersJson,
    },
    dependencies,
  )
}

export function isActiveInHalfOpenInterval(
  validFrom: string | null,
  validTo: string | null,
  referenceDate: string,
) {
  if (!isIsoCalendarDate(referenceDate)) return false
  return (
    (validFrom === null || validFrom <= referenceDate) &&
    (validTo === null || referenceDate < validTo)
  )
}

export function resolveOrganizationName(
  organization: Readonly<Organization>,
  referenceDate: string,
  relations: readonly Readonly<OrganizationRelation>[],
  claims: readonly Readonly<Claim>[],
): OrganizationNameResolution {
  if (!isIsoCalendarDate(referenceDate))
    return { ok: false, reason: 'invalid_date' }
  if (
    !isActiveInHalfOpenInterval(
      organization.valid_from,
      organization.valid_to,
      referenceDate,
    )
  )
    return { ok: false, reason: 'organization_inactive' }
  const relation = relations.find(
    (item) =>
      item.relation_type === 'renamed_to' &&
      item.subject_organization_id === organization.organization_id &&
      item.object_organization_id === organization.organization_id &&
      isActiveInHalfOpenInterval(item.valid_from, item.valid_to, referenceDate),
  )
  if (!relation) {
    return {
      ok: true,
      organization,
      displayName: organization.name,
      source: 'organization.name',
    }
  }
  const claim = claims.find(
    (item) =>
      item.claim_id === relation.claim_id &&
      item.predicate === 'renamed_to' &&
      item.object_type === 'literal' &&
      typeof item.object_value === 'string',
  )
  if (!claim?.object_value) return { ok: false, reason: 'claim_unavailable' }
  return {
    ok: true,
    organization,
    displayName: claim.object_value,
    source: 'renamed_to_claim_literal',
  }
}
