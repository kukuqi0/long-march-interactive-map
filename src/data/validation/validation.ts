import historicalNamesJson from '../sample-draft/t04-places/historical-place-names.json'
import placeManifestJson from '../sample-draft/t04-places/manifest.json'
import placeGeometriesText from '../sample-draft/t04-places/place-geometries.geojson?raw'
import placesJson from '../sample-draft/t04-places/places.json'
import eventManifestJson from '../sample-draft/t05-events/manifest.json'
import eventsJson from '../sample-draft/t05-events/events.json'
import organizationManifestJson from '../sample-draft/t06-pre-organizations/manifest.json'
import organizationsJson from '../sample-draft/t06-pre-organizations/organizations.json'
import routeGeometriesText from '../sample-draft/t06-routes/route-geometries.geojson?raw'
import routeManifestJson from '../sample-draft/t06-routes/manifest.json'
import routeSegmentsJson from '../sample-draft/t06-routes/route-segments.json'
import routesJson from '../sample-draft/t06-routes/routes.json'
import aggregateMembersJson from '../sample-draft/t11-pre-history/aggregate-members.json'
import claimsJson from '../sample-draft/t11-pre-history/claims.json'
import disputesJson from '../sample-draft/t11-pre-history/disputes.json'
import evidenceLinksJson from '../sample-draft/t11-pre-history/evidence-links.json'
import historyManifestJson from '../sample-draft/t11-pre-history/manifest.json'
import organizationRelationsJson from '../sample-draft/t11-pre-history/organization-relations.json'
import sourcesJson from '../sample-draft/t11-pre-history/sources.json'
import { validateEventDataset } from '../loaders/loadEvents'
import { validateHistoryDataset } from '../loaders/loadHistory'
import { validateOrganizationDataset } from '../loaders/loadOrganizations'
import { validatePlaceDataset } from '../loaders/loadPlaces'
import { validateRouteDataset } from '../loaders/loadRoutes'
import type { Claim, EvidenceLink, Source } from '../../types/history'
import type {
  ClaimPublicationStatus,
  ProjectValidationInput,
  ProjectValidationResult,
  ValidatedProjectDatasets,
  ValidationIssue,
  ValidationReport,
  ValidationScope,
  ValidationSection,
  ValidationSeverity,
} from '../../types/validation'

type LoaderIssue = {
  file: string
  record_id: string
  field: string
  error_code: string
  message: string
}

type ManifestView = {
  dataset_tier: string
  is_sample: boolean
  publication_allowed: boolean
  review_status: string
  data_version: string
}

const severityRank: Record<ValidationSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
}

const datasetFiles = {
  places: 'src/data/sample-draft/t04-places/manifest.json',
  events: 'src/data/sample-draft/t05-events/manifest.json',
  organizations: 'src/data/sample-draft/t06-pre-organizations/manifest.json',
  routes: 'src/data/sample-draft/t06-routes/manifest.json',
  history: 'src/data/sample-draft/t11-pre-history/manifest.json',
} as const

function issue(
  scope: ValidationScope,
  code: string,
  entityType: string,
  entityId: string,
  field: string,
  file: string,
  message: string,
  relatedIds?: readonly string[],
  severity: ValidationSeverity = 'error',
): ValidationIssue {
  return {
    code,
    severity,
    scope,
    entity_type: entityType,
    entity_id: entityId,
    field,
    path: `${file}#${entityId}.${field}`,
    file,
    message,
    ...(relatedIds?.length ? { related_ids: [...relatedIds] } : {}),
  }
}

function entityTypeForFile(file: string) {
  if (file.includes('historical-place-names')) return 'historical_place_name'
  if (file.includes('place-geometries')) return 'place_geometry'
  if (file.endsWith('places.json')) return 'place'
  if (file.endsWith('events.json')) return 'event'
  if (file.endsWith('organizations.json')) return 'organization'
  if (file.endsWith('routes.json')) return 'route'
  if (file.includes('route-segments')) return 'route_segment'
  if (file.includes('route-geometries')) return 'route_geometry'
  if (file.includes('organization-relations')) return 'organization_relation'
  if (file.endsWith('claims.json')) return 'claim'
  if (file.endsWith('sources.json')) return 'source'
  if (file.includes('evidence-links')) return 'evidence_link'
  if (file.endsWith('disputes.json')) return 'dispute'
  if (file.includes('aggregate-members')) return 'aggregate_member_mapping'
  return file.endsWith('manifest.json') || file === 'manifest.json'
    ? 'manifest'
    : 'dataset'
}

function canonicalCode(sourceCode: string) {
  const code = sourceCode.toUpperCase()
  if (code.includes('MISSING_REQUIRED') || code.includes('REQUIRED_FIELD'))
    return 'SCHEMA_REQUIRED_FIELD'
  if (
    code.includes('UNKNOWN_FIELD') ||
    code.includes('PROHIBITED_ALIAS') ||
    code.includes('UNEXPECTED_FIELD')
  )
    return 'SCHEMA_UNKNOWN_FIELD'
  if (code.includes('DUPLICATE')) return 'DUPLICATE_ID'
  if (
    code.includes('PREFIX') ||
    code.includes('STABLE_ID') ||
    /^INVALID_[A-Z_]+_ID$/.test(code)
  )
    return 'INVALID_ID_PREFIX'
  if (
    code.includes('GEOMETRY') &&
    (code.includes('MISSING') || code.includes('NOT_FOUND'))
  )
    return 'INVALID_GEOMETRY_REF'
  if (
    code.includes('NOT_FOUND') ||
    (code.includes('UNKNOWN_') && code.includes('REFERENCE')) ||
    code.includes('BROKEN_') ||
    (code.includes('MISSING_') && code.includes('REFERENCE'))
  )
    return 'BROKEN_FOREIGN_KEY'
  if (
    code.includes('TIME_COMBINATION') ||
    code.includes('TIME_RANGE') ||
    code.includes('DATE_RANGE') ||
    code.includes('END_BEFORE') ||
    code.includes('REVERSE')
  )
    return 'INVALID_TIME_RANGE'
  if (
    code.includes('ENUM') ||
    code.includes('PRECISION') ||
    code.includes('CERTAINTY') ||
    code.includes('SOURCE_TYPE') ||
    code.includes('SOURCE_QUALITY') ||
    code.includes('REVIEW_STATUS') ||
    code.includes('EVIDENCE_RELATION') ||
    code.includes('DISPUTE_STATUS') ||
    code.includes('DISPUTE_TYPE')
  )
    return 'INVALID_ENUM'
  return code
}

function normalizeFile(file: string, datasetPath: string) {
  if (file.includes('/') || file.includes('\\'))
    return file.replaceAll('\\', '/')
  return `${datasetPath}/${file}`
}

function mapLoaderIssue(
  item: LoaderIssue,
  datasetPath: string,
): ValidationIssue {
  const file = normalizeFile(item.file, datasetPath)
  return {
    ...issue(
      'structural',
      canonicalCode(item.error_code),
      entityTypeForFile(file),
      item.record_id || 'dataset',
      item.field,
      file,
      item.message,
    ),
    source_code: item.error_code,
  }
}

export function sortValidationIssues(
  items: readonly ValidationIssue[],
): ValidationIssue[] {
  return [...items].sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      a.scope.localeCompare(b.scope) ||
      a.entity_type.localeCompare(b.entity_type) ||
      a.entity_id.localeCompare(b.entity_id) ||
      a.code.localeCompare(b.code) ||
      a.field.localeCompare(b.field) ||
      a.file.localeCompare(b.file),
  )
}

function dedupeIssues(items: readonly ValidationIssue[]) {
  const unique = new Map<string, ValidationIssue>()
  for (const item of items) {
    const key = [
      item.scope,
      item.code,
      item.entity_type,
      item.entity_id,
      item.field,
      item.file,
    ].join('|')
    if (!unique.has(key)) unique.set(key, item)
  }
  return sortValidationIssues([...unique.values()])
}

export function getCurrentProjectValidationInput(): ProjectValidationInput {
  return {
    places: {
      manifest: placeManifestJson,
      places: placesJson,
      historicalNames: historicalNamesJson,
      geometries: JSON.parse(placeGeometriesText) as unknown,
      datasetPath: 'src/data/sample-draft/t04-places',
    },
    events: {
      manifest: eventManifestJson,
      events: eventsJson,
      datasetPath: 'src/data/sample-draft/t05-events',
    },
    organizations: {
      manifest: organizationManifestJson,
      organizations: organizationsJson,
      datasetPath: 'src/data/sample-draft/t06-pre-organizations',
    },
    routes: {
      manifest: routeManifestJson,
      routes: routesJson,
      routeSegments: routeSegmentsJson,
      geometries: JSON.parse(routeGeometriesText) as unknown,
      datasetPath: 'src/data/sample-draft/t06-routes',
    },
    history: {
      manifest: historyManifestJson,
      organizationRelations: organizationRelationsJson,
      claims: claimsJson,
      sources: sourcesJson,
      evidenceLinks: evidenceLinksJson,
      disputes: disputesJson,
      aggregateMembers: aggregateMembersJson,
      datasetPath: 'src/data/sample-draft/t11-pre-history',
    },
  }
}

export function validateDatasetStructure(input: ProjectValidationInput) {
  const places = validatePlaceDataset(input.places)
  const organizations = validateOrganizationDataset(input.organizations)
  const events = validateEventDataset(input.events, places)
  const routes = validateRouteDataset(input.routes, places, organizations)
  const history = validateHistoryDataset(input.history, {
    places,
    events,
    organizations,
    routes,
  })
  const datasets: ValidatedProjectDatasets = {
    places,
    events,
    organizations,
    routes,
    history,
  }
  const structuralIssues = [
    ...places.errors.map((item) =>
      mapLoaderIssue(
        item,
        input.places.datasetPath ?? 'src/data/sample-draft/t04-places',
      ),
    ),
    ...events.errors.map((item) =>
      mapLoaderIssue(
        item,
        input.events.datasetPath ?? 'src/data/sample-draft/t05-events',
      ),
    ),
    ...organizations.errors.map((item) =>
      mapLoaderIssue(
        item,
        input.organizations.datasetPath ??
          'src/data/sample-draft/t06-pre-organizations',
      ),
    ),
    ...routes.errors.map((item) =>
      mapLoaderIssue(
        item,
        input.routes.datasetPath ?? 'src/data/sample-draft/t06-routes',
      ),
    ),
    ...history.errors.map((item) =>
      mapLoaderIssue(
        item,
        input.history.datasetPath ?? 'src/data/sample-draft/t11-pre-history',
      ),
    ),
  ]
  return { datasets, issues: dedupeIssues(structuralIssues) }
}

export function validateForeignKeys(
  datasets: ValidatedProjectDatasets,
): ValidationIssue[] {
  const items: ValidationIssue[] = []
  const placeIds = new Set(datasets.places.places.map((item) => item.place_id))
  const eventIds = new Set(datasets.events.events.map((item) => item.event_id))
  const organizationIds = new Set(
    datasets.organizations.organizations.map((item) => item.organization_id),
  )
  const routeIds = new Set(datasets.routes.routes.map((item) => item.route_id))
  const segmentIds = new Set(
    datasets.routes.routeSegments.map((item) => item.route_segment_id),
  )
  const relationIds = new Set(
    datasets.history.organizationRelations.map((item) => item.relation_id),
  )
  const claimIds = new Set(datasets.history.claims.map((item) => item.claim_id))
  const sourceIds = new Set(
    datasets.history.sources.map((item) => item.source_id),
  )
  const geometryIds = new Set([
    ...datasets.places.featureCollection.features.map((item) => item.id),
    ...datasets.routes.featureCollection.features.map((item) => item.id),
  ])
  const entityIds = new Set([
    ...placeIds,
    ...eventIds,
    ...organizationIds,
    ...routeIds,
    ...segmentIds,
    ...relationIds,
  ])

  const broken = (
    entityType: string,
    entityId: string,
    field: string,
    file: string,
    targetId: string,
  ) =>
    items.push(
      issue(
        'structural',
        'BROKEN_FOREIGN_KEY',
        entityType,
        entityId,
        field,
        file,
        `${field}引用的稳定ID ${targetId} 不存在。`,
        [targetId],
      ),
    )

  for (const name of datasets.places.historicalNames) {
    if (!placeIds.has(name.place_id))
      broken(
        'historical_place_name',
        name.historical_name_id,
        'place_id',
        'src/data/sample-draft/t04-places/historical-place-names.json',
        name.place_id,
      )
    if (!claimIds.has(name.claim_id))
      broken(
        'historical_place_name',
        name.historical_name_id,
        'claim_id',
        'src/data/sample-draft/t04-places/historical-place-names.json',
        name.claim_id,
      )
  }
  for (const event of datasets.events.events) {
    if (event.place_id && !placeIds.has(event.place_id))
      broken(
        'event',
        event.event_id,
        'place_id',
        'src/data/sample-draft/t05-events/events.json',
        event.place_id,
      )
  }
  for (const route of datasets.routes.routes) {
    if (!organizationIds.has(route.organization_id))
      broken(
        'route',
        route.route_id,
        'organization_id',
        'src/data/sample-draft/t06-routes/routes.json',
        route.organization_id,
      )
  }
  for (const segment of datasets.routes.routeSegments) {
    if (!routeIds.has(segment.route_id))
      broken(
        'route_segment',
        segment.route_segment_id,
        'route_id',
        'src/data/sample-draft/t06-routes/route-segments.json',
        segment.route_id,
      )
    if (!organizationIds.has(segment.organization_id))
      broken(
        'route_segment',
        segment.route_segment_id,
        'organization_id',
        'src/data/sample-draft/t06-routes/route-segments.json',
        segment.organization_id,
      )
    for (const [field, value] of [
      ['from_place_id', segment.from_place_id],
      ['to_place_id', segment.to_place_id],
    ] as const) {
      if (value && !placeIds.has(value))
        broken(
          'route_segment',
          segment.route_segment_id,
          field,
          'src/data/sample-draft/t06-routes/route-segments.json',
          value,
        )
    }
  }
  for (const relation of datasets.history.organizationRelations) {
    for (const [field, value] of [
      ['subject_organization_id', relation.subject_organization_id],
      ['object_organization_id', relation.object_organization_id],
    ] as const) {
      if (!organizationIds.has(value))
        broken(
          'organization_relation',
          relation.relation_id,
          field,
          'src/data/sample-draft/t11-pre-history/organization-relations.json',
          value,
        )
    }
    if (!claimIds.has(relation.claim_id))
      broken(
        'organization_relation',
        relation.relation_id,
        'claim_id',
        'src/data/sample-draft/t11-pre-history/organization-relations.json',
        relation.claim_id,
      )
  }
  const subjectSets: Record<string, ReadonlySet<string>> = {
    organization: organizationIds,
    place: placeIds,
    event: eventIds,
    route_segment: segmentIds,
    relation: relationIds,
  }
  for (const claim of datasets.history.claims) {
    const subjects = subjectSets[claim.subject_type]
    if (!subjects || !subjects.has(claim.subject_id))
      broken(
        'claim',
        claim.claim_id,
        'subject_id',
        'src/data/sample-draft/t11-pre-history/claims.json',
        claim.subject_id,
      )
    if (
      claim.object_type === 'entity' &&
      typeof claim.object_value === 'string' &&
      !entityIds.has(claim.object_value)
    )
      broken(
        'claim',
        claim.claim_id,
        'object_value',
        'src/data/sample-draft/t11-pre-history/claims.json',
        claim.object_value,
      )
    if (
      claim.object_type === 'geometry' &&
      typeof claim.object_value === 'string' &&
      !geometryIds.has(claim.object_value)
    )
      items.push(
        issue(
          'structural',
          'INVALID_GEOMETRY_REF',
          'claim',
          claim.claim_id,
          'object_value',
          'src/data/sample-draft/t11-pre-history/claims.json',
          `geometry对象 ${claim.object_value} 不存在。`,
          [claim.object_value],
        ),
      )
  }
  for (const evidence of datasets.history.evidenceLinks) {
    if (!claimIds.has(evidence.claim_id))
      broken(
        'evidence_link',
        evidence.evidence_link_id,
        'claim_id',
        'src/data/sample-draft/t11-pre-history/evidence-links.json',
        evidence.claim_id,
      )
    if (!sourceIds.has(evidence.source_id))
      broken(
        'evidence_link',
        evidence.evidence_link_id,
        'source_id',
        'src/data/sample-draft/t11-pre-history/evidence-links.json',
        evidence.source_id,
      )
  }
  for (const dispute of datasets.history.disputes) {
    for (const claimId of dispute.competing_claim_ids) {
      if (!claimIds.has(claimId))
        broken(
          'dispute',
          dispute.dispute_id,
          'competing_claim_ids',
          'src/data/sample-draft/t11-pre-history/disputes.json',
          claimId,
        )
    }
    if (dispute.adopted_claim_id && !claimIds.has(dispute.adopted_claim_id))
      broken(
        'dispute',
        dispute.dispute_id,
        'adopted_claim_id',
        'src/data/sample-draft/t11-pre-history/disputes.json',
        dispute.adopted_claim_id,
      )
  }
  return dedupeIssues(items)
}

export function validateBusinessInvariants(
  input: ProjectValidationInput,
  datasets: ValidatedProjectDatasets,
): ValidationIssue[] {
  const items: ValidationIssue[] = []
  const claimsById = new Map(
    datasets.history.claims.map((claim) => [claim.claim_id, claim]),
  )
  const manifests = [
    ['places', input.places.datasetPath, input.places.manifest],
    ['events', input.events.datasetPath, input.events.manifest],
    [
      'organizations',
      input.organizations.datasetPath,
      input.organizations.manifest,
    ],
    ['routes', input.routes.datasetPath, input.routes.manifest],
    ['history', input.history.datasetPath, input.history.manifest],
  ] as const
  for (const [name, path, raw] of manifests) {
    const manifest = raw as Partial<ManifestView>
    if (
      path?.replaceAll('\\', '/').includes('/published/') &&
      (manifest.dataset_tier === 'sample-draft' || manifest.is_sample === true)
    )
      items.push(
        issue(
          'structural',
          'SAMPLE_DATA_IN_PUBLISHED_PATH',
          'manifest',
          name,
          'dataset_tier',
          `${path}/manifest.json`,
          'sample-draft数据不得进入published目录。',
        ),
      )
  }
  for (const organization of datasets.organizations.organizations) {
    if (
      organization.valid_from &&
      organization.valid_to &&
      organization.valid_from > organization.valid_to
    )
      items.push(
        issue(
          'structural',
          'INVALID_TIME_RANGE',
          'organization',
          organization.organization_id,
          'valid_to',
          'src/data/sample-draft/t06-pre-organizations/organizations.json',
          'organization半开区间的valid_to不得早于valid_from。',
        ),
      )
  }
  for (const historicalName of datasets.places.historicalNames) {
    const claim = claimsById.get(historicalName.claim_id)
    if (!claim) continue
    const mismatches = [
      claim.subject_type !== 'place' ? 'subject_type' : null,
      claim.subject_id !== historicalName.place_id ? 'subject_id' : null,
      claim.predicate !== 'had_name' ? 'predicate' : null,
      claim.object_type !== 'literal' ? 'object_type' : null,
      claim.object_value !== historicalName.name ? 'object_value' : null,
    ].filter((field): field is string => field !== null)
    for (const field of mismatches)
      items.push(
        issue(
          'structural',
          'HISTORICAL_NAME_CLAIM_MISMATCH',
          'historical_place_name',
          historicalName.historical_name_id,
          `claim_id.${field}`,
          'src/data/sample-draft/t04-places/historical-place-names.json',
          `had_name声明的${field}与historical_place_name不一致。`,
          [historicalName.claim_id],
        ),
      )
  }
  for (const relation of datasets.history.organizationRelations) {
    if (
      relation.valid_from &&
      relation.valid_to &&
      relation.valid_from > relation.valid_to
    )
      items.push(
        issue(
          'structural',
          'INVALID_TIME_RANGE',
          'organization_relation',
          relation.relation_id,
          'valid_to',
          'src/data/sample-draft/t11-pre-history/organization-relations.json',
          'organization_relation半开区间的valid_to不得早于valid_from。',
        ),
      )
  }
  const sequenceKeys = new Set<string>()
  for (const segment of datasets.routes.routeSegments) {
    const key = `${segment.route_id}:${segment.sequence_no}`
    if (sequenceKeys.has(key))
      items.push(
        issue(
          'structural',
          'DUPLICATE_ROUTE_SEQUENCE',
          'route_segment',
          segment.route_segment_id,
          'sequence_no',
          'src/data/sample-draft/t06-routes/route-segments.json',
          '同一route内sequence_no必须唯一。',
          [segment.route_id],
        ),
      )
    sequenceKeys.add(key)
    if (
      (segment.route_certainty === 'R5' || segment.route_certainty === 'RU') &&
      segment.geometry_ref !== null
    )
      items.push(
        issue(
          'structural',
          'UNKNOWN_ROUTE_MUST_NOT_HAVE_GEOMETRY',
          'route_segment',
          segment.route_segment_id,
          'geometry_ref',
          'src/data/sample-draft/t06-routes/route-segments.json',
          `${segment.route_certainty}必须保持geometry_ref=null。`,
        ),
      )
  }
  const r4Features = new Map<string, Set<string>>()
  for (const feature of datasets.routes.featureCollection.features) {
    const set = r4Features.get(feature.properties.route_segment_id) ?? new Set()
    set.add(feature.id)
    r4Features.set(feature.properties.route_segment_id, set)
  }
  for (const segment of datasets.routes.routeSegments) {
    if (
      segment.route_certainty === 'R4' &&
      (r4Features.get(segment.route_segment_id)?.size ?? 0) < 2
    )
      items.push(
        issue(
          'structural',
          'R4_REQUIRES_COMPETING_GEOMETRIES',
          'route_segment',
          segment.route_segment_id,
          'geometry_ref',
          'src/data/sample-draft/t06-routes/route-segments.json',
          'R4结构必须保留至少两个分离的竞争Geometry。',
        ),
      )
  }
  return dedupeIssues(items)
}

export function evaluateClaimPublicationReadiness(
  claim: Pick<Claim, 'claim_id'> & { review_status: string },
  evidence: readonly Readonly<EvidenceLink>[],
  sources: readonly Readonly<Source>[],
  manifest: Readonly<{
    publication_allowed: boolean
    dataset_tier?: string
  }> | null,
): ClaimPublicationStatus {
  if (claim.review_status !== 'published')
    return {
      meetsMinimum: false,
      code: 'claim_not_published',
      label: `当前声明为${claim.review_status}，未达到发布状态。`,
    }
  if (manifest?.publication_allowed !== true)
    return {
      meetsMinimum: false,
      code: 'dataset_not_publishable',
      label: '当前数据集不可发布，不能标记为发布证据完备。',
    }
  if (manifest.dataset_tier && manifest.dataset_tier !== 'published')
    return {
      meetsMinimum: false,
      code: 'dataset_tier_blocked',
      label: '当前数据集不是published层，不能标记为发布证据完备。',
    }
  const supports = evidence.filter(
    (link) =>
      link.claim_id === claim.claim_id && link.evidence_relation === 'supports',
  )
  if (supports.length === 0)
    return {
      meetsMinimum: false,
      code: 'missing_supports',
      label: '没有支持证据，未满足最低追溯门槛。',
    }
  const sourcesById = new Map(
    sources.map((source) => [source.source_id, source]),
  )
  if (supports.some((link) => !sourcesById.has(link.source_id)))
    return {
      meetsMinimum: false,
      code: 'broken_evidence_fk',
      label: '证据来源外键不完整，未满足最低追溯门槛。',
    }
  if (supports.every((link) => !link.locator?.trim()))
    return {
      meetsMinimum: false,
      code: 'missing_locator',
      label: '支持证据缺少有效定位，未满足最低追溯门槛。',
    }
  if (
    supports.every(
      (link) => sourcesById.get(link.source_id)?.source_quality === 'QX',
    )
  )
    return {
      meetsMinimum: false,
      code: 'qx_only_support',
      label: '支持证据全部来自QX不可验证来源，未满足发布门槛。',
    }
  return {
    meetsMinimum: true,
    code: 'complete',
    label: '发布声明的最低证据追溯条件已满足。',
  }
}

export function validatePublicationReadiness(
  datasets: ValidatedProjectDatasets,
): ValidationIssue[] {
  const items: ValidationIssue[] = []
  const manifests = [
    ['places', datasetFiles.places, datasets.places.manifest],
    ['events', datasetFiles.events, datasets.events.manifest],
    [
      'organizations',
      datasetFiles.organizations,
      datasets.organizations.manifest,
    ],
    ['routes', datasetFiles.routes, datasets.routes.manifest],
    ['history', datasetFiles.history, datasets.history.manifest],
  ] as const
  for (const [datasetId, file, manifest] of manifests) {
    if (!manifest) continue
    const manifestView = manifest as unknown as ManifestView
    if (manifestView.dataset_tier !== 'published')
      items.push(
        issue(
          'publication',
          'PUBLICATION_DATASET_TIER_BLOCKED',
          'manifest',
          datasetId,
          'dataset_tier',
          file,
          `dataset_tier=${manifestView.dataset_tier}，不是published发布层。`,
        ),
      )
    if (manifestView.publication_allowed !== true)
      items.push(
        issue(
          'publication',
          'PUBLICATION_DATASET_BLOCKED',
          'manifest',
          datasetId,
          'publication_allowed',
          file,
          'publication_allowed=false构成数据包级发布硬阻塞。',
        ),
      )
    if (manifestView.review_status !== 'published')
      items.push(
        issue(
          'publication',
          'PUBLICATION_REVIEW_STATUS_BLOCKED',
          'manifest',
          datasetId,
          'review_status',
          file,
          `review_status=${manifestView.review_status}，未达到published。`,
        ),
      )
  }
  const historyManifestFile =
    'src/data/sample-draft/t11-pre-history/manifest.json'
  for (const claim of datasets.history.claims) {
    const relatedEvidence = datasets.history.evidenceLinks.filter(
      (item) => item.claim_id === claim.claim_id,
    )
    const supports = relatedEvidence.filter(
      (item) => item.evidence_relation === 'supports',
    )
    const sourcesById = new Map(
      datasets.history.sources.map((source) => [source.source_id, source]),
    )
    if (claim.review_status !== ('published' as string))
      items.push(
        issue(
          'publication',
          'PUBLICATION_REVIEW_STATUS_BLOCKED',
          'claim',
          claim.claim_id,
          'review_status',
          'src/data/sample-draft/t11-pre-history/claims.json',
          `当前声明为${claim.review_status}，未达到published。`,
        ),
      )
    if (claim.claim_data_state === 'unknown')
      items.push(
        issue(
          'publication',
          'PUBLICATION_CLAIM_STATE_BLOCKED',
          'claim',
          claim.claim_id,
          'claim_data_state',
          'src/data/sample-draft/t11-pre-history/claims.json',
          'unknown声明仅表达待核验占位，不能发布为历史结论。',
        ),
      )
    if (claim.claim_confidence === 'C-U')
      items.push(
        issue(
          'publication',
          'PUBLICATION_CONFIDENCE_BLOCKED',
          'claim',
          claim.claim_id,
          'claim_confidence',
          'src/data/sample-draft/t11-pre-history/claims.json',
          'C-U只能表达资料不足，不能发布为已证实历史结论。',
        ),
      )
    if (supports.length === 0)
      items.push(
        issue(
          'publication',
          'PUBLICATION_MISSING_SUPPORT',
          'claim',
          claim.claim_id,
          'evidence_link',
          historyManifestFile,
          '声明没有supports evidence。',
        ),
      )
    if (supports.some((link) => !sourcesById.has(link.source_id)))
      items.push(
        issue(
          'publication',
          'PUBLICATION_BROKEN_EVIDENCE_FK',
          'claim',
          claim.claim_id,
          'source_id',
          'src/data/sample-draft/t11-pre-history/evidence-links.json',
          '支持证据的source外键不完整。',
        ),
      )
    if (
      supports.length === 0 ||
      supports.every((link) => !link.locator?.trim())
    )
      items.push(
        issue(
          'publication',
          'PUBLICATION_MISSING_LOCATOR',
          'claim',
          claim.claim_id,
          'locator',
          'src/data/sample-draft/t11-pre-history/evidence-links.json',
          '声明没有带有效locator的supports evidence。',
        ),
      )
    if (
      supports.length > 0 &&
      supports.every(
        (link) => sourcesById.get(link.source_id)?.source_quality === 'QX',
      )
    )
      items.push(
        issue(
          'publication',
          'PUBLICATION_QX_ONLY_SUPPORT',
          'claim',
          claim.claim_id,
          'source_quality',
          'src/data/sample-draft/t11-pre-history/sources.json',
          '支持证据全部来自QX不可验证来源。',
        ),
      )
  }
  const claimsById = new Map(
    datasets.history.claims.map((claim) => [claim.claim_id, claim]),
  )
  const sourcesById = new Map(
    datasets.history.sources.map((source) => [source.source_id, source]),
  )
  for (const dispute of datasets.history.disputes) {
    const reviewStatus = dispute.review_status as string
    if (reviewStatus !== 'second_review' && reviewStatus !== 'published')
      items.push(
        issue(
          'publication',
          'PUBLICATION_REVIEW_STATUS_BLOCKED',
          'dispute',
          dispute.dispute_id,
          'review_status',
          'src/data/sample-draft/t11-pre-history/disputes.json',
          '争议尚未完成独立复审，不能达到发布门槛。',
        ),
      )
    if (dispute.dispute_type !== 'route') continue
    for (const claimId of dispute.competing_claim_ids) {
      const claim = claimsById.get(claimId)
      const evidence = datasets.history.evidenceLinks.filter(
        (item) =>
          item.claim_id === claimId && item.evidence_relation !== 'background',
      )
      const hasNonQxEvidence = evidence.some(
        (item) => sourcesById.get(item.source_id)?.source_quality !== 'QX',
      )
      if (!claim || !hasNonQxEvidence)
        items.push(
          issue(
            'publication',
            'PUBLICATION_R4_MISSING_EVIDENCE',
            'dispute',
            dispute.dispute_id,
            'competing_claim_ids',
            'src/data/sample-draft/t11-pre-history/disputes.json',
            `R4竞争声明 ${claimId} 尚无非QX真实史料证据链。`,
            [claimId],
          ),
        )
    }
  }
  return dedupeIssues(items)
}

function section(
  scope: ValidationScope,
  issues: readonly ValidationIssue[],
): ValidationSection {
  const scoped = issues.filter((item) => item.scope === scope)
  const blocking = scoped.filter((item) => item.severity === 'error').length
  return {
    status:
      scope === 'structural'
        ? blocking === 0
          ? 'pass'
          : 'fail'
        : blocking === 0
          ? 'ready'
          : 'blocked',
    issue_count: scoped.length,
    blocking_error_count: blocking,
    issues: scoped,
  }
}

export function buildValidationReport(
  structuralIssues: readonly ValidationIssue[],
  publicationIssues: readonly ValidationIssue[],
): ValidationReport {
  const issues = dedupeIssues([...structuralIssues, ...publicationIssues])
  return {
    structural: section('structural', issues),
    publication: section('publication', issues),
    issues,
  }
}

export function validateProjectData(
  input: ProjectValidationInput,
): ProjectValidationResult {
  const structure = validateDatasetStructure(input)
  const crossEntityIssues = validateForeignKeys(structure.datasets)
  const businessIssues = validateBusinessInvariants(input, structure.datasets)
  const structuralIssues = dedupeIssues([
    ...structure.issues,
    ...crossEntityIssues,
    ...businessIssues,
  ])
  const publicationIssues = validatePublicationReadiness(structure.datasets)
  return {
    datasets: structure.datasets,
    report: buildValidationReport(structuralIssues, publicationIssues),
  }
}

export class ProjectDataValidationError extends Error {
  readonly report: ValidationReport

  constructor(report: ValidationReport) {
    const first = report.structural.issues[0]
    super(
      first
        ? `项目数据结构校验失败：${first.code} ${first.entity_type}/${first.entity_id} ${first.field}`
        : '项目数据结构校验失败。',
    )
    this.name = 'ProjectDataValidationError'
    this.report = report
  }
}

export function loadValidatedProjectData(
  input: ProjectValidationInput = getCurrentProjectValidationInput(),
): ProjectValidationResult {
  const result = validateProjectData(input)
  if (result.report.structural.status === 'fail')
    throw new ProjectDataValidationError(result.report)
  return result
}
