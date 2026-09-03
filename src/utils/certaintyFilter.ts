import type {
  Claim,
  ClaimConfidence,
  Dispute,
  DisputeStatus,
  LoadedHistoryDataset,
} from '../types/history'
import { routeCertainties, type LoadedRouteDataset } from '../types/route'
import type {
  CertaintyFilterState,
  ClaimConfidencePresentation,
  DisputePresentation,
  RouteVariantView,
} from '../types/certaintyFilter'

export const defaultCertaintyFilter: CertaintyFilterState = Object.freeze({
  selectedRouteCertainties: Object.freeze([...routeCertainties]),
  showDisputedAlternatives: false,
  routeVariantView: 'both',
})

const disputeLabels: Record<
  DisputeStatus,
  Omit<DisputePresentation, 'code'>
> = {
  D0: {
    label: '无已知争议',
    description: '当前没有已登记的竞争声明；这不等于已经穷尽所有材料。',
    adopted: false,
    equalAlternatives: false,
    archived: false,
  },
  D1: {
    label: '轻微差异',
    description: '存在不影响核心结论的轻微表述差异。',
    adopted: false,
    equalAlternatives: false,
    archived: false,
  },
  D2: {
    label: '实质争议未解决',
    description: '竞争声明均未被正式采纳。',
    adopted: false,
    equalAlternatives: true,
    archived: false,
  },
  D3: {
    label: '暂采一说',
    description: '编辑上暂采一个竞争声明，替代方案入口必须保留。',
    adopted: true,
    equalAlternatives: false,
    archived: false,
  },
  D4: {
    label: '并列展示',
    description: '竞争声明同权展示，不设默认优先。',
    adopted: false,
    equalAlternatives: true,
    archived: false,
  },
  D5: {
    label: '已解决并留档',
    description: '当前结论与历史争议记录分开表达。',
    adopted: true,
    equalAlternatives: false,
    archived: true,
  },
}

const confidenceLabels: Record<
  ClaimConfidence,
  Omit<ClaimConfidencePresentation, 'code'>
> = {
  'C-A': { label: 'C-A', description: '高可信声明' },
  'C-B': { label: 'C-B', description: '较高可信声明' },
  'C-C': { label: 'C-C', description: '证据仅支持当前粒度' },
  'C-D': { label: 'C-D', description: '实质冲突、高风险孤证或解释分歧' },
  'C-U': { label: 'C-U', description: '证据不足；不等同于存在争议' },
}

export function resolveDisputePresentation(
  status: DisputeStatus,
): DisputePresentation {
  return { code: status, ...disputeLabels[status] }
}

export function resolveClaimConfidencePresentation(
  confidence: ClaimConfidence,
): ClaimConfidencePresentation {
  return { code: confidence, ...confidenceLabels[confidence] }
}

export function validateDisputeView(
  dispute: Pick<
    Dispute,
    'dispute_status' | 'competing_claim_ids' | 'adopted_claim_id'
  >,
) {
  if (dispute.competing_claim_ids.length < 2)
    return '争议必须至少包含两个竞争声明。'
  if (
    dispute.adopted_claim_id !== null &&
    !dispute.competing_claim_ids.includes(dispute.adopted_claim_id)
  )
    return '采纳声明必须属于竞争集合。'
  if (dispute.dispute_status === 'D3' && dispute.adopted_claim_id === null)
    return 'D3暂采一说必须给出采纳声明。'
  if (
    ['D2', 'D4'].includes(dispute.dispute_status) &&
    dispute.adopted_claim_id !== null
  )
    return `${dispute.dispute_status}不得设置默认采纳声明。`
  return null
}

export function filterRouteSegmentIdsByCertainty(
  visibleIds: ReadonlySet<string>,
  dataset: LoadedRouteDataset,
  selectedCertainties: readonly string[],
) {
  const selected = new Set(selectedCertainties)
  return new Set(
    dataset.routeSegments
      .filter(
        (segment) =>
          visibleIds.has(segment.route_segment_id) &&
          selected.has(segment.route_certainty),
      )
      .map((segment) => segment.route_segment_id),
  )
}

export function filterRouteGeometryByDisputeView(
  dataset: LoadedRouteDataset,
  state: Pick<
    CertaintyFilterState,
    'showDisputedAlternatives' | 'routeVariantView'
  >,
): LoadedRouteDataset {
  const certaintyBySegment = new Map(
    dataset.routeSegments.map((segment) => [
      segment.route_segment_id,
      segment.route_certainty,
    ]),
  )
  return {
    ...dataset,
    featureCollection: {
      ...dataset.featureCollection,
      features: dataset.featureCollection.features.filter((feature) => {
        if (
          certaintyBySegment.get(feature.properties.route_segment_id) !== 'R4'
        )
          return true
        if (!state.showDisputedAlternatives) return false
        return (
          state.routeVariantView === 'both' ||
          feature.properties.alternative_id === state.routeVariantView
        )
      }),
    },
  }
}

export function claimsForDispute(
  dispute: Dispute,
  claims: readonly Readonly<Claim>[],
) {
  const byId = new Map(claims.map((claim) => [claim.claim_id, claim]))
  return dispute.competing_claim_ids.flatMap((id) => {
    const claim = byId.get(id)
    return claim ? [claim] : []
  })
}

export function disputeForRouteSegment(
  routeSegmentId: string,
  history: LoadedHistoryDataset,
) {
  return history.disputes.find((dispute) =>
    claimsForDispute(dispute, history.claims).some(
      (claim) =>
        claim.subject_type === 'route_segment' &&
        claim.subject_id === routeSegmentId,
    ),
  )
}

export function updateRouteVariantView(
  current: RouteVariantView,
  next: RouteVariantView,
) {
  return current === next ? current : next
}
