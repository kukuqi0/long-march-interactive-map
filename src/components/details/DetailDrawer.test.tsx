import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { loadT05EventDataset } from '../../data/loaders/loadEvents'
import { loadT06PreOrganizationDataset } from '../../data/loaders/loadOrganizations'
import { loadT04PlaceDataset } from '../../data/loaders/loadPlaces'
import { loadT06RouteDataset } from '../../data/loaders/loadRoutes'
import { loadT11PreHistoryDataset } from '../../data/loaders/loadHistory'
import type { ActiveDetail, PersonDetailRecord } from '../../types/detail'
import { DetailDrawer, MissingFieldState, PersonDetail } from './DetailDrawer'

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

function renderDetail(active: ActiveDetail) {
  const onClose = vi.fn()
  const onOpenDetail = vi.fn()
  const result = render(
    <DetailDrawer
      active={active}
      places={places}
      events={events}
      organizations={organizations}
      routes={routes}
      history={history}
      onClose={onClose}
      onOpenDetail={onOpenDetail}
    />,
  )
  return { ...result, onClose, onOpenDetail }
}

describe('detail drawer', () => {
  it('renders place names, missing values, exact relations, and sample state', () => {
    renderDetail({ objectType: 'place', objectId: 'place_t04_s1_placeholder' })

    expect(screen.getByText(/common/)).toBeInTheDocument()
    expect(screen.getAllByText(/alias/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('unknown')).toHaveLength(2)
    expect(screen.getAllByText('C-U')).toHaveLength(2)
    expect(screen.getAllByText('查看来源（0）')).toHaveLength(2)
    expect(screen.getAllByText('待核验').length).toBeGreaterThan(0)
  })

  it('marks representative and SU places without inventing locations', () => {
    const { rerender } = renderDetail({
      objectType: 'place',
      objectId: 'place_t04_s2_placeholder',
    })
    expect(screen.getByText(/区域代表点：仅用于表达区域/)).toBeInTheDocument()

    rerender(
      <DetailDrawer
        active={{ objectType: 'place', objectId: 'place_t04_su_placeholder' }}
        places={places}
        events={events}
        organizations={organizations}
        routes={routes}
        onClose={vi.fn()}
        onOpenDetail={vi.fn()}
      />,
    )
    expect(screen.getByText('SU（空间未知）')).toBeInTheDocument()
    expect(screen.getByText(/不生成坐标或地图定位/)).toBeInTheDocument()
  })

  it('keeps original event time separate and does not infer route relations', () => {
    renderDetail({
      objectType: 'event',
      objectId: 'event_t05_rendezvous_placeholder',
    })
    expect(screen.getByText('T6')).toBeInTheDocument()
    expect(screen.getAllByText('时间未知')).toHaveLength(2)
    expect(screen.getByText('关联数据尚未建立')).toBeInTheDocument()
  })

  it('renders the real Liping place and event with an S1 representative-point boundary', () => {
    const { rerender } = renderDetail({
      objectType: 'place',
      objectId: 'place_liping_city_1934',
    })
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'LI' &&
          element.textContent === '黎平县城（common；未知—未知）',
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/S1聚落级代表点/)).toHaveLength(2)
    expect(screen.getAllByText(/不表示.*具体战斗位置/)).toHaveLength(2)
    expect(
      screen.getByText(/claim_place_liping_city_had_name/),
    ).toBeInTheDocument()

    rerender(
      <DetailDrawer
        active={{
          objectType: 'event',
          objectId: 'event_liping_capture_1934_12_15',
        }}
        places={places}
        events={events}
        organizations={organizations}
        routes={routes}
        history={history}
        onClose={vi.fn()}
        onOpenDetail={vi.fn()}
      />,
    )
    expect(screen.getByText('红一军团攻占黎平县城')).toBeInTheDocument()
    expect(screen.getAllByText('1934-12-15', { selector: 'dd' })).toHaveLength(
      2,
    )
    expect(screen.getByText(/地图位置仅为S1县城级代表点/)).toBeInTheDocument()
    expect(
      screen.getByText(/claim_event_liping_capture_had_participant/),
    ).toBeInTheDocument()
    expect(screen.getByText('C-C')).toBeInTheDocument()
    expect(screen.getByText(/证据仅支持当前粒度/)).toBeInTheDocument()
  })

  it('shows both R4 alternatives and never presents a unique route', () => {
    renderDetail({
      objectType: 'route_segment',
      objectId: 'seg_t06_r4_placeholder',
    })
    expect(screen.getByText(/替代方案A（结构测试）/)).toBeInTheDocument()
    expect(screen.getByText(/替代方案B（结构测试）/)).toBeInTheDocument()
    expect(screen.getByText(/未采纳唯一方案/)).toBeInTheDocument()
    expect(screen.getByText('争议 · R4争议路线')).toBeInTheDocument()
    expect(screen.getByText(/实质争议未解决/)).toBeInTheDocument()
    expect(
      screen.getAllByText('claim_seg_t06_r4_placeholder_route_variant_a'),
    ).toHaveLength(2)
    expect(
      screen.getByText('dispute_seg_t06_r4_placeholder_route_variants'),
    ).toBeInTheDocument()
    expect(screen.getByText(/当前没有史料证据链/)).toBeInTheDocument()
  })

  it('shows R5 as list-only with no invented connection', () => {
    renderDetail({
      objectType: 'route_segment',
      objectId: 'seg_t06_r5_placeholder',
    })
    expect(screen.getByText(/R5 中间路线不详/)).toBeInTheDocument()
    expect(screen.getByText(/未提供几何；不生成连接线/)).toBeInTheDocument()
    expect(screen.getByText('否（仅列表与详情）')).toBeInTheDocument()
  })

  it('reads the actual organization registry and exposes the aggregate disclaimer', () => {
    const { onOpenDetail } = renderDetail({
      objectType: 'route_segment',
      objectId: 'seg_t06_r1_placeholder',
    })
    fireEvent.click(screen.getByRole('button', { name: /打开组织详情/ }))
    expect(onOpenDetail).toHaveBeenCalledWith(
      { objectType: 'organization', objectId: 'org_central_red_army' },
      expect.any(HTMLButtonElement),
    )

    renderDetail({
      objectType: 'organization',
      objectId: 'org_central_red_army',
    })
    expect(screen.getByText('专题分组说明')).toBeInTheDocument()
    expect(
      screen.getByText(/不代表历史时期的正式建制隶属关系/),
    ).toBeInTheDocument()
  })

  it('renders the real corps without applying the product aggregate disclaimer', () => {
    const { container } = renderDetail({
      objectType: 'organization',
      objectId: 'org_red_first_corps',
    })
    expect(screen.getByText('中国工农红军第一军团')).toBeInTheDocument()
    expect(screen.getByText('历史组织说明')).toBeInTheDocument()
    expect(screen.getByText(/不是组织成立日期/)).toBeInTheDocument()
    expect(screen.queryByText('专题分组说明')).not.toBeInTheDocument()
    const claimId = screen.getByText(
      'claim_org_red_first_corps_renamed_to_first_army_1935_07_21',
    )
    expect(claimId.closest('li')).toHaveTextContent('renamed_to')
    expect(claimId).toHaveClass('source-panel__token')
    expect(container.querySelector('.detail-drawer__body')).toBeInTheDocument()
    expect(container.querySelector('.source-panel__claims')).toBeInTheDocument()
  })

  it('reports unknown and mismatched IDs without default fallback', () => {
    renderDetail({ objectType: 'organization', objectId: 'org_missing' })
    expect(screen.getByText('ORGANIZATION_NOT_FOUND')).toBeInTheDocument()
    expect(screen.getByText(/未使用默认对象回退/)).toBeInTheDocument()
  })

  it('rejects an ID belonging to another object type', () => {
    renderDetail({
      objectType: 'place',
      objectId: 'event_t05_battle_placeholder',
    })
    expect(screen.getByText('DETAIL_OBJECT_NOT_FOUND')).toBeInTheDocument()
    expect(screen.getByText('place')).toBeInTheDocument()
  })

  it('closes by button and Escape with an accessible title', () => {
    const { onClose } = renderDetail({
      objectType: 'event',
      objectId: 'event_t05_battle_placeholder',
    })
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/event/)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '关闭对象详情' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('does not mutate any validated source dataset while rendering details', () => {
    const snapshots = [places, events, organizations.organizations, routes].map(
      (item) => JSON.stringify(item),
    )
    const { rerender } = renderDetail({
      objectType: 'place',
      objectId: 'place_t04_s1_placeholder',
    })
    rerender(
      <DetailDrawer
        active={{
          objectType: 'route_segment',
          objectId: 'seg_t06_r4_placeholder',
        }}
        places={places}
        events={events}
        organizations={organizations}
        routes={routes}
        onClose={vi.fn()}
        onOpenDetail={vi.fn()}
      />,
    )
    expect(
      [places, events, organizations.organizations, routes].map((item) =>
        JSON.stringify(item),
      ),
    ).toEqual(snapshots)
  })
})

describe('person detail boundary uses test fixtures only', () => {
  it('distinguishes empty aliases, null description, and missing common fields', () => {
    const person: PersonDetailRecord = {
      person_id: 'person_test_fixture',
      canonical_name: '测试夹具人物',
      aliases: [],
      description: null,
      review_status: 'draft',
    }
    render(<PersonDetail person={person} />)
    expect(screen.getByText('空数组')).toBeInTheDocument()
    expect(screen.getByText('未提供')).toBeInTheDocument()
    expect(screen.queryByText('data_version')).not.toBeInTheDocument()
    expect(screen.queryByText('created_at')).not.toBeInTheDocument()
    expect(screen.queryByText('updated_at')).not.toBeInTheDocument()
  })

  it('makes withdrawn status explicit without inventing a withdrawal record', () => {
    const withdrawn: PersonDetailRecord = {
      person_id: 'person_withdrawn_fixture',
      canonical_name: '撤回测试夹具',
      aliases: null,
      description: null,
      review_status: 'withdrawn',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      data_version: 'test-only',
    }
    render(<PersonDetail person={withdrawn} />)
    expect(screen.getByText('已撤回')).toBeInTheDocument()
    expect(screen.getByText('撤回原因/记录未提供')).toBeInTheDocument()
    expect(screen.getByText(/当前内容不作为有效结论/)).toBeInTheDocument()
  })
})

describe('explicit missing field vocabulary', () => {
  it.each([
    ['absent', '字段不存在'],
    ['unknown', '未知'],
    ['empty', '空数组'],
    ['relation', '关联数据尚未建立'],
    ['phase', '当前阶段未实现'],
    ['failed', '数据加载失败'],
  ] as const)('renders %s as %s', (kind, label) => {
    render(<MissingFieldState kind={kind} />)
    expect(screen.getByText(label)).toHaveAttribute('data-missing-kind', kind)
  })
})
