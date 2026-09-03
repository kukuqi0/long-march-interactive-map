import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { loadT06PreOrganizationDataset } from '../../data/loaders/loadOrganizations'
import { loadT04PlaceDataset } from '../../data/loaders/loadPlaces'
import { loadT06RouteDataset } from '../../data/loaders/loadRoutes'
import { RouteList } from './RouteList'

const places = loadT04PlaceDataset()
const dataset = loadT06RouteDataset(places, loadT06PreOrganizationDataset())

describe('route segment list', () => {
  it('shows eight accessible segments and all certainty labels', () => {
    render(
      <RouteList
        dataset={dataset}
        places={places}
        selectedRouteSegmentId={null}
        onSelectRouteSegment={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('heading', { name: '路线段列表' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(8)
    expect(screen.getAllByText(/R1 可靠路线/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/R5 中间路线不详/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/RU 资料不足/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/仅列表/)).toHaveLength(2)
  })

  it('keeps the aggregate organization disclaimer visible', () => {
    render(
      <RouteList
        dataset={dataset}
        places={places}
        selectedRouteSegmentId={null}
        onSelectRouteSegment={vi.fn()}
      />,
    )
    expect(screen.getByText(/此处分组用于专题浏览/)).toHaveTextContent(
      '不代表历史时期的正式建制隶属关系',
    )
  })

  it('selects R5 and RU only through keyboard-operable list buttons', () => {
    const onSelect = vi.fn()
    render(
      <RouteList
        dataset={dataset}
        places={places}
        selectedRouteSegmentId="seg_t06_r5_placeholder"
        onSelectRouteSegment={onSelect}
      />,
    )
    const r5 = screen.getByRole('button', {
      name: /待核验结构测试路线A · 路段3/,
    })
    expect(r5).toHaveAttribute('aria-pressed', 'true')
    const ru = screen.getByRole('button', {
      name: /待核验结构测试路线B · 路段2/,
    })
    fireEvent.click(ru)
    expect(onSelect).toHaveBeenCalledWith('seg_t06_ru_placeholder')
  })

  it('shows non-blocking empty and error states', () => {
    render(
      <RouteList
        dataset={{
          ...dataset,
          routeSegments: [],
          featureCollection: { type: 'FeatureCollection', features: [] },
          errors: [
            {
              file: 'route-segments.json',
              record_id: 'seg_bad',
              field: 'organization_id',
              error_code: 'ORGANIZATION_NOT_FOUND',
              message: 'invalid',
            },
          ],
        }}
        places={places}
        selectedRouteSegmentId={null}
        onSelectRouteSegment={vi.fn()}
      />,
    )
    expect(screen.getByText(/暂无可显示的路线段/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('已隔离1项路线数据错误')
  })
})
