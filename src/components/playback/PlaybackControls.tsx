import type {
  PlaybackSpeed,
  PlaybackState,
  PlaybackStep,
} from '../../types/playback'

interface PlaybackControlsProps {
  state: PlaybackState
  currentStep: PlaybackStep | null
  errorMessage: string | null
  onToggle: () => void
  onSpeedChange: (speed: PlaybackSpeed) => void
}

const statusLabels = {
  idle: '尚未开始',
  playing: '播放中',
  paused: '已暂停',
  completed: '已完成，不会自动循环',
  error: '播放已因错误停止',
} as const

export function PlaybackControls({
  state,
  currentStep,
  errorMessage,
  onToggle,
  onSpeedChange,
}: PlaybackControlsProps) {
  const primaryLabel =
    state.status === 'playing'
      ? '暂停路线播放'
      : state.status === 'paused' && state.canResume
        ? '继续路线播放'
        : '开始路线播放'

  return (
    <section
      className="playback-controls"
      aria-labelledby="playback-controls-title"
    >
      <div className="playback-controls__heading">
        <h3 id="playback-controls-title">路线播放</h3>
        <strong aria-live="polite">{statusLabels[state.status]}</strong>
      </div>
      <div className="playback-controls__actions">
        <button type="button" onClick={onToggle}>
          {primaryLabel}
        </button>
        <fieldset>
          <legend>演示节奏</legend>
          {[0.5, 1, 2].map((speed) => (
            <label key={speed}>
              <input
                type="radio"
                name="playback-speed"
                value={speed}
                checked={state.speed === speed}
                onChange={() => onSpeedChange(speed as PlaybackSpeed)}
              />
              {speed}×
            </label>
          ))}
        </fieldset>
      </div>
      <p>播放速度仅控制界面演示节奏，不代表真实行军速度；1×每个步骤约1秒。</p>
      <p>
        默认按合法日期event推进唯一参考日期；route_segment只按现有时间边界和同route内sequence_no展示，不建立事件—路线历史关联。
      </p>
      {currentStep ? (
        <div className="playback-controls__current" aria-live="polite">
          {currentStep.kind === 'event_anchor' ? (
            <>
              <strong>当前事件锚点：{currentStep.label}</strong>
              <span>
                {currentStep.eventId} · {currentStep.timePrecision} ·{' '}
                {currentStep.date}
              </span>
              <span>原时间文本：{currentStep.timeOriginalText}</span>
            </>
          ) : (
            <>
              <strong>当前路线段：{currentStep.label}</strong>
              <span>
                {currentStep.routeSegmentId} · {currentStep.timePrecision} ·{' '}
                {currentStep.routeCertainty} ·{' '}
                {Math.round(state.progress * 100)}%
              </span>
              <span>原时间文本：{currentStep.timeOriginalText}</span>
              {currentStep.routeCertainty === 'R4' ? (
                <span>替代方案并列展示，当前未作裁定。</span>
              ) : null}
              {currentStep.isGap ? (
                <span>中间路线不详，未播放连接路径。</span>
              ) : null}
              {currentStep.timePrecision === 'T6' ? (
                <span>日期不详，仅知顺序；本步骤不移动日期游标。</span>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {errorMessage ? (
        <p className="playback-controls__error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <p className="playback-controls__notice">
        路线播放用于浏览现有记录，不表示所有相关单位同时、同地或沿同一路线移动。
      </p>
    </section>
  )
}
