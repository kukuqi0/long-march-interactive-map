import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { loadT05EventDataset } from '../../data/loaders/loadEvents'
import { loadT04PlaceDataset } from '../../data/loaders/loadPlaces'
import { EventList } from './EventList'

const dataset = loadT05EventDataset(loadT04PlaceDataset())

describe('event list', () => {
  it('shows ten accessible selection buttons and allowed fields', () => {
    render(
      <EventList
        dataset={dataset}
        selectedEventId={null}
        onSelectEvent={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: '事件列表' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(10)
    expect(screen.getByText(/时间精度 TU/)).toBeInTheDocument()
    expect(screen.getAllByText(/仅列表/)).toHaveLength(4)
  })

  it('uses aria-pressed and keyboard-operable buttons for local selection', () => {
    const onSelect = vi.fn()
    render(
      <EventList
        dataset={dataset}
        selectedEventId="event_t05_meeting_placeholder"
        onSelectEvent={onSelect}
      />,
    )
    const selected = screen.getByRole('button', {
      name: /待核验占位：会议类型事件A/,
    })
    expect(selected).toHaveAttribute('aria-pressed', 'true')

    const suEvent = screen.getByRole('button', {
      name: /待核验占位：驻留类型事件A/,
    })
    fireEvent.click(suEvent)
    expect(onSelect).toHaveBeenCalledWith('event_t05_stay_placeholder')
  })

  it('shows a non-blocking empty and error state', () => {
    render(
      <EventList
        dataset={{
          ...dataset,
          events: [],
          featureCollection: { type: 'FeatureCollection', features: [] },
          errors: [
            {
              file: 'events.json',
              record_id: 'event_bad',
              field: 'event_type',
              error_code: 'INVALID_EVENT_TYPE',
              message: 'invalid',
            },
          ],
        }}
        selectedEventId={null}
        onSelectEvent={vi.fn()}
      />,
    )
    expect(screen.getByText(/暂无可显示的事件/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('已隔离1项事件数据错误')
  })
})
