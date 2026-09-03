import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { loadT05EventDataset } from '../../data/loaders/loadEvents'
import { loadT11PreHistoryDataset } from '../../data/loaders/loadHistory'
import { loadT06PreOrganizationDataset } from '../../data/loaders/loadOrganizations'
import { loadT04PlaceDataset } from '../../data/loaders/loadPlaces'
import { loadT06RouteDataset } from '../../data/loaders/loadRoutes'
import type {
  Claim,
  EvidenceLink,
  LoadedHistoryDataset,
  Source,
} from '../../types/history'
import { SourcePanel } from './SourcePanel'

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

describe('source panel with current data', () => {
  it('shows the organization rename claim and its support source card', () => {
    const { container } = render(
      <SourcePanel
        history={history}
        objectType="organization"
        objectId="org_red_first_corps"
      />,
    )
    expect(
      screen.getByText(
        'claim_org_red_first_corps_renamed_to_first_army_1935_07_21',
      ),
    ).toHaveClass('source-panel__token')
    const toggle = screen.getByRole('button', { name: '查看来源（1）' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText('坚持北上和南下分裂阶段(1935.6.14——1935.10.19)'),
    ).toBeInTheDocument()
    expect(screen.getByText('ST5 · 正式党史/军史/战史')).toBeInTheDocument()
    expect(screen.getByText('Q5 · 线索/概述')).toBeInTheDocument()
    const publicLink = screen.getByRole('link', {
      name: /打开公开来源：坚持北上/,
    })
    expect(publicLink).toHaveAttribute('target', '_blank')
    expect(publicLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(container).not.toHaveTextContent('file_location')
  })

  it('shows the place support and real production background evidence separately', () => {
    render(
      <SourcePanel
        history={history}
        objectType="place"
        objectId="place_liping_city_1934"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '查看来源（2）' }))
    expect(
      screen.getByRole('heading', { name: '支持（1）' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '反对（0）' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '背景（1）' }),
    ).toBeInTheDocument()
    expect(screen.getByText('背景证据')).toBeInTheDocument()
    expect(screen.getByText('黎平县·黎平会议会址')).toBeInTheDocument()
    expect(screen.getByText(/不支持1934-12-15具体战斗位置/)).toBeInTheDocument()
  })

  it('shows two supports for the real event and reverse-indexes a shared source to both claims', () => {
    render(
      <SourcePanel
        history={history}
        objectType="event"
        objectId="event_liping_capture_1934_12_15"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '查看来源（2）' }))
    expect(
      screen.getByRole('heading', { name: '支持（2）' }),
    ).toBeInTheDocument()
    const reverse = screen.getByRole('button', { name: '查看关联声明（2）' })
    fireEvent.click(reverse)
    const reversePanel = document.getElementById(
      reverse.getAttribute('aria-controls')!,
    )!
    expect(
      within(reversePanel).getByText('claim_place_liping_city_had_name'),
    ).toBeInTheDocument()
    expect(
      within(reversePanel).getByText(
        'claim_event_liping_capture_had_participant',
      ),
    ).toBeInTheDocument()
  })

  it('shows both R4 structure claims with explicit zero-evidence states', () => {
    render(
      <SourcePanel
        history={history}
        objectType="route_segment"
        objectId="seg_t06_r4_placeholder"
      />,
    )
    const zeroEvidenceButtons = screen.getAllByRole('button', {
      name: '查看来源（0）',
    })
    expect(zeroEvidenceButtons).toHaveLength(2)
    fireEvent.click(zeroEvidenceButtons[0])
    expect(
      screen.getByText(/该争议方案目前没有史料证据链接/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '支持（0）' }),
    ).toBeInTheDocument()
  })

  it('shows an exact empty state instead of inventing claims', () => {
    render(
      <SourcePanel
        history={history}
        objectType="event"
        objectId="event_t05_battle_placeholder"
      />,
    )
    expect(screen.getByText('暂无关联声明')).toHaveAttribute('role', 'status')
  })
})

describe('source panel evidence states', () => {
  it('shows contradiction, missing locator and excerpt separately without exposing file_location', () => {
    const claim: Claim = {
      ...history.claims[0],
      claim_id: 'claim_test_long_identifier_for_source_panel_layout',
      subject_type: 'event',
      subject_id: 'event_t05_battle_placeholder',
    }
    const source: Source = {
      ...history.sources[0],
      source_id: 'src_test_long_identifier_for_source_panel_layout',
      public_url: null,
      file_location: 'private-source-location',
    }
    const evidence: EvidenceLink = {
      ...history.evidenceLinks[0],
      evidence_link_id: 'ev_test_long_identifier_for_source_panel_layout',
      claim_id: claim.claim_id,
      source_id: source.source_id,
      evidence_relation: 'contradicts',
      locator: null,
      excerpt: null,
      interpretation_note: null,
    }
    const fixture: LoadedHistoryDataset = {
      ...history,
      claims: [claim],
      sources: [source],
      evidenceLinks: [evidence],
    }
    const { container } = render(
      <SourcePanel
        history={fixture}
        objectType="event"
        objectId="event_t05_battle_placeholder"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '查看来源（1）' }))
    expect(
      screen.getByRole('heading', { name: '反对（1）' }),
    ).toBeInTheDocument()
    expect(screen.getByText('反对证据')).toBeInTheDocument()
    expect(screen.getByText('定位未完成')).toBeInTheDocument()
    expect(
      screen.getByText(/不能满足发布支持证据的定位门槛/),
    ).toBeInTheDocument()
    expect(screen.getByText('未录入短摘')).toBeInTheDocument()
    expect(screen.getByText('未录入解释边界')).toBeInTheDocument()
    expect(screen.getByText('无公开链接')).toBeInTheDocument()
    expect(container).not.toHaveTextContent('secret-source.pdf')
    expect(container.querySelectorAll('.source-panel__token')).not.toHaveLength(
      0,
    )
  })
})
