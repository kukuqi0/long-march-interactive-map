import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { initialPlaybackState } from '../../utils/playback'
import { PlaybackControls } from './PlaybackControls'

describe('route playback controls', () => {
  it('exposes one start/pause control, exactly three UI speeds and no reset or loop', () => {
    const onToggle = vi.fn()
    const onSpeedChange = vi.fn()
    render(
      <PlaybackControls
        state={initialPlaybackState}
        currentStep={null}
        errorMessage={null}
        onToggle={onToggle}
        onSpeedChange={onSpeedChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /开始路线播放/ }))
    fireEvent.click(screen.getByRole('radio', { name: '2×' }))
    expect(onToggle).toHaveBeenCalledOnce()
    expect(onSpeedChange).toHaveBeenCalledWith(2)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /重置|循环/ })).toBeNull()
    expect(screen.getByText(/不代表真实行军速度/)).toBeInTheDocument()
  })

  it('shows R4 parallel alternatives and progress without claiming a decision', () => {
    render(
      <PlaybackControls
        state={{
          ...initialPlaybackState,
          status: 'playing',
          stepIndex: 1,
          progress: 0.4,
        }}
        currentStep={{
          kind: 'route_segment',
          stepId: 'segment:seg_r4',
          routeSegmentId: 'seg_r4',
          routeId: 'route_test',
          routeTitle: '测试路线',
          sequenceNo: 1,
          label: '测试路线 · 路段1',
          anchorEventId: 'event_test',
          anchorDate: '1935-01-01',
          timePrecision: 'T4',
          timeOriginalText: '测试区间',
          routeCertainty: 'R4',
          hasGeometry: true,
          isGap: false,
        }}
        errorMessage={null}
        onToggle={vi.fn()}
        onSpeedChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/seg_r4/)).toHaveTextContent('40%')
    expect(screen.getByText(/替代方案并列展示/)).toHaveTextContent(
      '当前未作裁定',
    )
  })

  it('labels T6 and R5 as a date-free gap with no connecting path', () => {
    render(
      <PlaybackControls
        state={{ ...initialPlaybackState, status: 'paused', stepIndex: 1 }}
        currentStep={{
          kind: 'route_segment',
          stepId: 'segment:seg_gap',
          routeSegmentId: 'seg_gap',
          routeId: 'route_test',
          routeTitle: '测试路线',
          sequenceNo: 2,
          label: '测试路线 · 路段2',
          anchorEventId: 'event_test',
          anchorDate: null,
          timePrecision: 'T6',
          timeOriginalText: '仅知顺序',
          routeCertainty: 'R5',
          hasGeometry: false,
          isGap: true,
        }}
        errorMessage={null}
        onToggle={vi.fn()}
        onSpeedChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/未播放连接路径/)).toBeInTheDocument()
    expect(screen.getByText(/不移动日期游标/)).toBeInTheDocument()
  })
})
