import { describe, expect, it } from 'vitest'
import { loadT05EventDataset } from '../data/loaders/loadEvents'
import { loadT11PreHistoryDataset } from '../data/loaders/loadHistory'
import { loadT06PreOrganizationDataset } from '../data/loaders/loadOrganizations'
import { loadT04PlaceDataset } from '../data/loaders/loadPlaces'
import { loadT06RouteDataset } from '../data/loaders/loadRoutes'
import type { EvidenceLink } from '../types/history'
import {
  getClaimsForObject,
  getClaimsForSource,
  getEvidenceForClaim,
  getSourceForEvidence,
  groupEvidenceByRelation,
  resolveClaimTraceabilityStatus,
  resolveEvidenceLocatorStatus,
  resolveSourceQualityDisplay,
  resolveSourceTypeDisplay,
  sourceQualityPresentation,
  sourceTypePresentation,
} from './sourcePanel'

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

describe('evidence selectors', () => {
  it('queries claims only by the exact subject type and stable ID', () => {
    expect(
      getClaimsForObject(
        history,
        'event',
        'event_liping_capture_1934_12_15',
      ).map((claim) => claim.claim_id),
    ).toEqual(['claim_event_liping_capture_had_participant'])
    expect(
      getClaimsForObject(history, 'event', 'event_t05_battle_placeholder'),
    ).toEqual([])
  })

  it('groups support, contradiction and background without treating background as proof', () => {
    const claimId = 'claim_place_liping_city_had_name'
    const evidence = getEvidenceForClaim(history, claimId)
    const fixtureContradiction: EvidenceLink = {
      ...evidence[0],
      evidence_link_id: 'ev_test_contradiction',
      evidence_relation: 'contradicts',
    }
    const groups = groupEvidenceByRelation([...evidence, fixtureContradiction])
    expect(groups.supports).toHaveLength(1)
    expect(groups.contradicts).toHaveLength(1)
    expect(groups.background).toHaveLength(1)
  })

  it('resolves evidence to sources and reverse-indexes one source to multiple claims', () => {
    const evidence = history.evidenceLinks.find(
      (item) => item.evidence_link_id === 'ev_liping_name_12371_2021',
    )!
    expect(getSourceForEvidence(history, evidence)?.source_id).toBe(
      'src_12371_zunyi_turning_point_2021',
    )
    expect(
      getClaimsForSource(history, 'src_12371_zunyi_turning_point_2021').map(
        ({ claim }) => claim.claim_id,
      ),
    ).toEqual([
      'claim_place_liping_city_had_name',
      'claim_event_liping_capture_had_participant',
    ])
  })
})

describe('source presentations', () => {
  it('covers ST1 through ST10 while preserving every code', () => {
    expect(Object.keys(sourceTypePresentation)).toEqual([
      'ST1',
      'ST2',
      'ST3',
      'ST4',
      'ST5',
      'ST6',
      'ST7',
      'ST8',
      'ST9',
      'ST10',
    ])
    expect(resolveSourceTypeDisplay('ST5')).toBe('ST5 · 正式党史/军史/战史')
  })

  it('covers Q1 through QX without percentage or star conversions', () => {
    expect(Object.keys(sourceQualityPresentation)).toEqual([
      'Q1',
      'Q2',
      'Q3',
      'Q4',
      'Q5',
      'QX',
    ])
    for (const quality of Object.keys(sourceQualityPresentation) as Array<
      keyof typeof sourceQualityPresentation
    >) {
      expect(resolveSourceQualityDisplay(quality)).not.toMatch(/%|星|100/)
    }
    expect(resolveSourceQualityDisplay('Q1')).toBe('Q1 · 原始材料')
    expect(resolveSourceQualityDisplay('QX')).toBe('QX · 不可验证')
  })
})

describe('locator and publication traceability boundary', () => {
  const baseEvidence = history.evidenceLinks[0]
  const publishedClaim = {
    claim_id: baseEvidence.claim_id,
    review_status: 'published',
  }
  const publishableManifest = { publication_allowed: true as const }

  it('distinguishes complete and missing locators', () => {
    expect(resolveEvidenceLocatorStatus('第12页')).toMatchObject({
      complete: true,
      label: '定位完整',
    })
    expect(resolveEvidenceLocatorStatus(null)).toMatchObject({
      complete: false,
      label: '定位未完成',
    })
  })

  it('accepts only a published fixture with support, locator, source FK and a publishable dataset', () => {
    expect(
      resolveClaimTraceabilityStatus(
        publishedClaim,
        [baseEvidence],
        history.sources,
        publishableManifest,
      ),
    ).toMatchObject({ meetsMinimum: true, code: 'complete' })
  })

  it('rejects published fixtures with a null locator or no support', () => {
    expect(
      resolveClaimTraceabilityStatus(
        publishedClaim,
        [{ ...baseEvidence, locator: null }],
        history.sources,
        publishableManifest,
      ).code,
    ).toBe('missing_locator')
    expect(
      resolveClaimTraceabilityStatus(
        publishedClaim,
        [{ ...baseEvidence, evidence_relation: 'background' }],
        history.sources,
        publishableManifest,
      ).code,
    ).toBe('missing_supports')
  })

  it('never presents actual draft sample data as published or publishable', () => {
    const actualClaim = history.claims[0]
    expect(
      resolveClaimTraceabilityStatus(
        actualClaim,
        getEvidenceForClaim(history, actualClaim.claim_id),
        history.sources,
        history.manifest,
      ),
    ).toMatchObject({
      meetsMinimum: false,
      code: 'claim_not_published',
    })
  })
})
