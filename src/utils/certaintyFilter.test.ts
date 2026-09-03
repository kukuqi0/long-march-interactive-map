import { describe, expect, it } from 'vitest'
import { loadT04PlaceDataset } from '../data/loaders/loadPlaces'
import { loadT05EventDataset } from '../data/loaders/loadEvents'
import { loadT11PreHistoryDataset } from '../data/loaders/loadHistory'
import { loadT06PreOrganizationDataset } from '../data/loaders/loadOrganizations'
import { loadT06RouteDataset } from '../data/loaders/loadRoutes'
import type { Dispute } from '../types/history'
import {
  defaultCertaintyFilter,
  disputeForRouteSegment,
  filterRouteGeometryByDisputeView,
  filterRouteSegmentIdsByCertainty,
  resolveClaimConfidencePresentation,
  resolveDisputePresentation,
  validateDisputeView,
} from './certaintyFilter'

const places = loadT04PlaceDataset()
const events = loadT05EventDataset(places)
const organizations = loadT06PreOrganizationDataset()
const routes = loadT06RouteDataset(places, organizations)
const history = loadT11PreHistoryDataset({
  places,
  events,
  organizations,
  routes,
})

describe('certainty and dispute semantics', () => {
  it('presents R1—RU without percentages and keeps unknown separate from disputed', () => {
    expect(defaultCertaintyFilter.selectedRouteCertainties).toEqual([
      'R1',
      'R2',
      'R3',
      'R4',
      'R5',
      'RU',
    ])
    expect(defaultCertaintyFilter.showDisputedAlternatives).toBe(false)
    const allText = [
      ...(['D0', 'D1', 'D2', 'D3', 'D4', 'D5'] as const).map(
        (status) => resolveDisputePresentation(status).description,
      ),
      ...(['C-A', 'C-B', 'C-C', 'C-D', 'C-U'] as const).map(
        (confidence) =>
          resolveClaimConfidencePresentation(confidence).description,
      ),
    ].join(' ')
    expect(allText).not.toMatch(/%|百分比/)
    expect(resolveClaimConfidencePresentation('C-U').description).toContain(
      '不等同于存在争议',
    )
    expect(resolveClaimConfidencePresentation('C-D').description).toContain(
      '实质冲突',
    )
  })

  it('supports D0—D5 and validates D2, D3 and D4 adoption rules with fixtures only', () => {
    expect(
      (['D0', 'D1', 'D2', 'D3', 'D4', 'D5'] as const).map(
        (status) => resolveDisputePresentation(status).code,
      ),
    ).toEqual(['D0', 'D1', 'D2', 'D3', 'D4', 'D5'])
    const base = {
      competing_claim_ids: ['claim_a', 'claim_b'],
      adopted_claim_id: null,
    }
    expect(validateDisputeView({ ...base, dispute_status: 'D2' })).toBeNull()
    expect(validateDisputeView({ ...base, dispute_status: 'D3' })).toContain(
      '必须给出',
    )
    expect(
      validateDisputeView({
        ...base,
        dispute_status: 'D3',
        adopted_claim_id: 'claim_a',
      }),
    ).toBeNull()
    expect(
      validateDisputeView({
        ...base,
        dispute_status: 'D4',
        adopted_claim_id: 'claim_a',
      }),
    ).toContain('不得设置')
  })

  it('filters route segments by certainty while leaving unknown R5/RU distinct from R4', () => {
    const allIds = new Set(
      routes.routeSegments.map((segment) => segment.route_segment_id),
    )
    const r4 = filterRouteSegmentIdsByCertainty(allIds, routes, ['R4'])
    const unknown = filterRouteSegmentIdsByCertainty(allIds, routes, [
      'R5',
      'RU',
    ])
    expect([...r4]).toEqual(['seg_t06_r4_placeholder'])
    expect([...unknown]).toEqual([
      'seg_t06_r5_placeholder',
      'seg_t06_ru_placeholder',
    ])
  })

  it('selects only existing A/B features and never averages, merges or creates a third geometry', () => {
    const r4Dataset = {
      ...routes,
      routeSegments: routes.routeSegments.filter(
        (segment) => segment.route_certainty === 'R4',
      ),
      featureCollection: {
        ...routes.featureCollection,
        features: routes.featureCollection.features.filter(
          (feature) => feature.properties.route_certainty === 'R4',
        ),
      },
    }
    const off = filterRouteGeometryByDisputeView(r4Dataset, {
      showDisputedAlternatives: false,
      routeVariantView: 'both',
    })
    const a = filterRouteGeometryByDisputeView(r4Dataset, {
      showDisputedAlternatives: true,
      routeVariantView: 'A',
    })
    const b = filterRouteGeometryByDisputeView(r4Dataset, {
      showDisputedAlternatives: true,
      routeVariantView: 'B',
    })
    const both = filterRouteGeometryByDisputeView(r4Dataset, {
      showDisputedAlternatives: true,
      routeVariantView: 'both',
    })
    expect(off.featureCollection.features).toHaveLength(0)
    expect(a.featureCollection.features.map((feature) => feature.id)).toEqual([
      'feature_t06_r4_a_placeholder',
    ])
    expect(b.featureCollection.features.map((feature) => feature.id)).toEqual([
      'feature_t06_r4_b_placeholder',
    ])
    expect(
      both.featureCollection.features.map((feature) => feature.id),
    ).toEqual(['feature_t06_r4_a_placeholder', 'feature_t06_r4_b_placeholder'])
    expect(both.featureCollection.features).toEqual(
      r4Dataset.featureCollection.features,
    )
  })

  it('associates the production dispute only through its competing route_segment claims', () => {
    const dispute = disputeForRouteSegment('seg_t06_r4_placeholder', history)
    expect(dispute?.dispute_status).toBe('D2')
    expect(
      disputeForRouteSegment('seg_t06_r5_placeholder', history),
    ).toBeUndefined()
    expect(validateDisputeView(dispute as Dispute)).toBeNull()
  })
})
