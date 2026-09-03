import type { DetailObjectType } from '../types/detail'
import type {
  Claim,
  ClaimPredicate,
  EvidenceLink,
  EvidenceRelation,
  LoadedHistoryDataset,
  Source,
  SourceQuality,
  SourceType,
} from '../types/history'
import type { ClaimPublicationStatus } from '../types/validation'
import { evaluateClaimPublicationReadiness } from '../data/validation/validation'

export const claimPredicatePresentation: Record<ClaimPredicate, string> = {
  renamed_to: '改称',
  had_name: '历史名称',
  had_participant: '参与组织',
  route_geometry_variant: '路线几何方案',
}

export const evidenceRelationPresentation: Record<EvidenceRelation, string> = {
  supports: '支持',
  contradicts: '反对',
  background: '背景',
}

export const sourceTypePresentation: Record<SourceType, string> = {
  ST1: '同期档案/命令/电报/战报/公文',
  ST2: '同期地图/行军图/作战图',
  ST3: '同期日记/书信/个人记录',
  ST4: '档案或文献汇编',
  ST5: '正式党史/军史/战史',
  ST6: '学术研究',
  ST7: '地方志/地方党史/地名志',
  ST8: '回忆录/口述史',
  ST9: '博物馆/纪念馆/权威机构专题材料',
  ST10: '普通网络线索',
}

export const sourceQualityPresentation: Record<SourceQuality, string> = {
  Q1: '原始材料',
  Q2: '权威整理/正式史',
  Q3: '有完整引注的学术研究',
  Q4: '有价值但存在来源局限',
  Q5: '线索/概述',
  QX: '不可验证',
}

export interface EvidenceGroups {
  supports: readonly Readonly<EvidenceLink>[]
  contradicts: readonly Readonly<EvidenceLink>[]
  background: readonly Readonly<EvidenceLink>[]
}

export interface SourceClaimReference {
  claim: Readonly<Claim>
  evidence: Readonly<EvidenceLink>
}

export interface EvidenceLocatorStatus {
  complete: boolean
  label: '定位完整' | '定位未完成'
  publicationMessage: string
}

export type ClaimTraceabilityStatus = ClaimPublicationStatus

export function getClaimsForObject(
  history: LoadedHistoryDataset,
  objectType: DetailObjectType,
  objectId: string,
) {
  return history.claims.filter(
    (claim) =>
      claim.subject_type === objectType && claim.subject_id === objectId,
  )
}

export function getEvidenceForClaim(
  history: LoadedHistoryDataset,
  claimId: string,
) {
  return history.evidenceLinks.filter((link) => link.claim_id === claimId)
}

export function groupEvidenceByRelation(
  evidence: readonly Readonly<EvidenceLink>[],
): EvidenceGroups {
  return {
    supports: evidence.filter((link) => link.evidence_relation === 'supports'),
    contradicts: evidence.filter(
      (link) => link.evidence_relation === 'contradicts',
    ),
    background: evidence.filter(
      (link) => link.evidence_relation === 'background',
    ),
  }
}

export function getSourceForEvidence(
  history: LoadedHistoryDataset,
  evidence: Readonly<EvidenceLink>,
) {
  return history.sources.find(
    (source) => source.source_id === evidence.source_id,
  )
}

export function getClaimsForSource(
  history: LoadedHistoryDataset,
  sourceId: string,
): readonly SourceClaimReference[] {
  const claimsById = new Map(
    history.claims.map((claim) => [claim.claim_id, claim] as const),
  )
  return history.evidenceLinks.flatMap((evidence) => {
    if (evidence.source_id !== sourceId) return []
    const claim = claimsById.get(evidence.claim_id)
    return claim ? [{ claim, evidence }] : []
  })
}

export function resolveSourceTypeDisplay(sourceType: SourceType) {
  return `${sourceType} · ${sourceTypePresentation[sourceType]}`
}

export function resolveSourceQualityDisplay(sourceQuality: SourceQuality) {
  return `${sourceQuality} · ${sourceQualityPresentation[sourceQuality]}`
}

export function resolveEvidenceLocatorStatus(
  locator: string | null,
): EvidenceLocatorStatus {
  const complete = typeof locator === 'string' && locator.trim().length > 0
  return complete
    ? {
        complete: true,
        label: '定位完整',
        publicationMessage:
          '已录入可复核定位；仍须结合审核与数据集发布状态判断。',
      }
    : {
        complete: false,
        label: '定位未完成',
        publicationMessage: '该证据当前不能满足发布支持证据的定位门槛。',
      }
}

export function resolveClaimTraceabilityStatus(
  claim: Pick<Claim, 'claim_id'> & { review_status: string },
  evidence: readonly Readonly<EvidenceLink>[],
  sources: readonly Readonly<Source>[],
  manifest: Readonly<{
    publication_allowed: boolean
    dataset_tier?: string
  }> | null,
): ClaimTraceabilityStatus {
  return evaluateClaimPublicationReadiness(claim, evidence, sources, manifest)
}
