import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { AppHeader } from './components/layout/AppHeader'
import { FilterSidebar } from './components/layout/FilterSidebar'
import { InfoPanel } from './components/layout/InfoPanel'
import { MainWorkspace } from './components/layout/MainWorkspace'
import { TimelinePanel } from './components/layout/TimelinePanel'
import { loadValidatedProjectData } from './data/validation/validation'
import type { ActiveDetail, OpenDetail } from './types/detail'
import {
  PLAYBACK_BASE_STEP_MS,
  PLAYBACK_TICK_MS,
  type PlaybackSpeed,
  type RoutePlaybackVisualState,
} from './types/playback'
import type { AppliedTimeFilter } from './types/timeFilter'
import type { TemporalObjectType } from './types/timeFilter'
import type { OrganizationMatchSource } from './types/history'
import type { CertaintyFilterState } from './types/certaintyFilter'
import { buildTimelineView, validateTimelineDate } from './utils/timeline'
import {
  buildPlaybackPlan,
  findPlaybackStartIndex,
  initialPlaybackState,
  playbackReducer,
} from './utils/playback'
import {
  buildTimeFilterResult,
  filterEventDataset,
  filterRouteDataset,
  validateTimeFilter,
} from './utils/timeFilter'
import {
  buildOrganizationFilterResult,
  buildOrganizationTree,
  combineOrganizationAndTimeVisibility,
  resolveOrganizationRelations,
  updateOrganizationSelection,
} from './utils/organizationFilter'
import {
  defaultCertaintyFilter,
  filterRouteGeometryByDisputeView,
  filterRouteSegmentIdsByCertainty,
} from './utils/certaintyFilter'
import './styles/tokens.css'
import './styles/app.css'
import './styles/layout.css'

const {
  datasets: {
    places: placeDataset,
    events: eventDataset,
    organizations: organizationDataset,
    routes: routeDataset,
    history: historyDataset,
  },
} = loadValidatedProjectData()

export default function App() {
  const [activeDetail, setActiveDetail] = useState<ActiveDetail | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedRouteSegmentId, setSelectedRouteSegmentId] = useState<
    string | null
  >(null)
  const [draftFilter, setDraftFilter] = useState<AppliedTimeFilter>({
    status: 'all',
    referenceDate: '',
  })
  const [appliedFilter, setAppliedFilter] = useState<AppliedTimeFilter>({
    status: 'all',
    referenceDate: '',
  })
  const [filterError, setFilterError] = useState<string | null>(null)
  const [timelineMessage, setTimelineMessage] = useState<string | null>(null)
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState<
    readonly string[]
  >([])
  const [organizationSelectionMessage, setOrganizationSelectionMessage] =
    useState<string | null>(null)
  const [certaintyFilter, setCertaintyFilter] = useState<CertaintyFilterState>(
    defaultCertaintyFilter,
  )
  const [playbackState, dispatchPlayback] = useReducer(
    playbackReducer,
    initialPlaybackState,
  )
  const detailTriggerRef = useRef<HTMLElement | null>(null)
  const timeFilterHeadingRef = useRef<HTMLHeadingElement>(null)
  const anchoredPlaybackStepRef = useRef<string | null>(null)

  const filterResult = useMemo(
    () =>
      buildTimeFilterResult(
        eventDataset.events,
        routeDataset.routeSegments,
        appliedFilter,
      ),
    [appliedFilter],
  )
  const organizationFilterResult = useMemo(
    () =>
      buildOrganizationFilterResult(
        selectedOrganizationIds,
        eventDataset.events,
        routeDataset.routes,
        routeDataset.routeSegments,
        historyDataset,
      ),
    [selectedOrganizationIds],
  )
  const visibleEventIds = useMemo(
    () =>
      combineOrganizationAndTimeVisibility(
        filterResult.eventIds,
        organizationFilterResult.eventIds,
      ),
    [filterResult.eventIds, organizationFilterResult.eventIds],
  )
  const timeAndOrganizationRouteSegmentIds = useMemo(
    () =>
      combineOrganizationAndTimeVisibility(
        filterResult.routeSegmentIds,
        organizationFilterResult.routeSegmentIds,
      ),
    [filterResult.routeSegmentIds, organizationFilterResult.routeSegmentIds],
  )
  const visibleRouteSegmentIds = useMemo(
    () =>
      filterRouteSegmentIdsByCertainty(
        timeAndOrganizationRouteSegmentIds,
        routeDataset,
        certaintyFilter.selectedRouteCertainties,
      ),
    [
      certaintyFilter.selectedRouteCertainties,
      timeAndOrganizationRouteSegmentIds,
    ],
  )
  const visibleEventDataset = useMemo(
    () => filterEventDataset(eventDataset, visibleEventIds),
    [visibleEventIds],
  )
  const visibleRouteDataset = useMemo(
    () =>
      filterRouteGeometryByDisputeView(
        filterRouteDataset(routeDataset, visibleRouteSegmentIds),
        certaintyFilter,
      ),
    [certaintyFilter, visibleRouteSegmentIds],
  )
  const timelineView = useMemo(
    () =>
      buildTimelineView(
        eventDataset.events,
        routeDataset.routes,
        routeDataset.routeSegments,
        visibleEventIds,
        visibleRouteSegmentIds,
      ),
    [visibleEventIds, visibleRouteSegmentIds],
  )
  const playbackPlan = useMemo(
    () =>
      buildPlaybackPlan(
        eventDataset.events,
        routeDataset.routes,
        routeDataset.routeSegments,
        routeDataset.featureCollection,
      ),
    [],
  )
  const playbackSteps = useMemo(() => {
    const organizationVisible = playbackPlan.steps.filter((step) =>
      step.kind === 'event_anchor'
        ? visibleEventIds.has(step.eventId)
        : visibleRouteSegmentIds.has(step.routeSegmentId),
    )
    return appliedFilter.status === 'sequence_only'
      ? organizationVisible.filter(
          (step) =>
            step.kind === 'route_segment' && step.timePrecision === 'T6',
        )
      : appliedFilter.status === 'unknown'
        ? []
        : organizationVisible
  }, [
    appliedFilter.status,
    playbackPlan.steps,
    visibleEventIds,
    visibleRouteSegmentIds,
  ])
  const currentPlaybackStep = playbackSteps[playbackState.stepIndex] ?? null
  const routePlayback = useMemo<RoutePlaybackVisualState>(() => {
    if (
      (playbackState.status !== 'playing' &&
        playbackState.status !== 'paused') ||
      currentPlaybackStep?.kind !== 'route_segment' ||
      !currentPlaybackStep.hasGeometry ||
      !visibleRouteSegmentIds.has(currentPlaybackStep.routeSegmentId)
    ) {
      return { routeSegmentId: null, progress: 0 }
    }
    return {
      routeSegmentId: currentPlaybackStep.routeSegmentId,
      progress: playbackState.progress,
    }
  }, [currentPlaybackStep, playbackState, visibleRouteSegmentIds])

  const organizationTree = useMemo(
    () =>
      buildOrganizationTree(
        organizationDataset,
        historyDataset,
        appliedFilter.referenceDate,
      ),
    [appliedFilter.referenceDate],
  )
  const organizationRelations = useMemo(
    () =>
      new Map(
        organizationDataset.organizations.map((organization) => [
          organization.organization_id,
          resolveOrganizationRelations(
            organization.organization_id,
            historyDataset.organizationRelations,
            historyDataset.claims,
            organizationDataset,
          ),
        ]),
      ),
    [],
  )

  const openDetail = useCallback<OpenDetail>((detail, trigger) => {
    if (!trigger.closest('[role="dialog"]') || !detailTriggerRef.current) {
      detailTriggerRef.current = trigger
    }
    setActiveDetail(detail)
  }, [])

  const closeDetail = useCallback(() => {
    setActiveDetail(null)
    queueMicrotask(() => {
      const trigger = detailTriggerRef.current
      if (trigger?.isConnected) trigger.focus()
      else timeFilterHeadingRef.current?.focus()
    })
  }, [])

  const pausePlayback = useCallback(() => {
    dispatchPlayback({ type: 'pause' })
  }, [])

  const interruptPlayback = useCallback(() => {
    anchoredPlaybackStepRef.current = null
    dispatchPlayback({ type: 'interrupt' })
  }, [])

  const selectEvent = useCallback((eventId: string) => {
    dispatchPlayback({ type: 'pause' })
    setSelectedEventId((current) => (current === eventId ? null : eventId))
  }, [])

  const selectRouteSegment = useCallback((routeSegmentId: string) => {
    dispatchPlayback({ type: 'pause' })
    setSelectedRouteSegmentId((current) =>
      current === routeSegmentId ? null : routeSegmentId,
    )
  }, [])

  const openDetailFromUser = useCallback<OpenDetail>(
    (detail, trigger) => {
      pausePlayback()
      openDetail(detail, trigger)
    },
    [openDetail, pausePlayback],
  )

  const applyFilterState = useCallback(
    (nextFilter: AppliedTimeFilter, restoreFocus = true) => {
      const timelineDateError = nextFilter.referenceDate
        ? validateTimelineDate(nextFilter.referenceDate)
        : null
      const error = timelineDateError ?? validateTimeFilter(nextFilter)
      if (error) {
        setFilterError(error.reason)
        return null
      }
      const nextResult = buildTimeFilterResult(
        eventDataset.events,
        routeDataset.routeSegments,
        nextFilter,
      )
      const nextVisibleEventIds = combineOrganizationAndTimeVisibility(
        nextResult.eventIds,
        organizationFilterResult.eventIds,
      )
      const nextVisibleRouteSegmentIds = filterRouteSegmentIdsByCertainty(
        combineOrganizationAndTimeVisibility(
          nextResult.routeSegmentIds,
          organizationFilterResult.routeSegmentIds,
        ),
        routeDataset,
        certaintyFilter.selectedRouteCertainties,
      )
      setFilterError(null)
      setTimelineMessage(null)
      setDraftFilter(nextFilter)
      setAppliedFilter(nextFilter)
      if (selectedEventId && !nextVisibleEventIds.has(selectedEventId)) {
        setSelectedEventId(null)
      }
      if (
        selectedRouteSegmentId &&
        !nextVisibleRouteSegmentIds.has(selectedRouteSegmentId)
      ) {
        setSelectedRouteSegmentId(null)
      }
      const hidesActiveDetail =
        activeDetail?.objectType === 'event'
          ? !nextVisibleEventIds.has(activeDetail.objectId)
          : activeDetail?.objectType === 'route_segment'
            ? !nextVisibleRouteSegmentIds.has(activeDetail.objectId)
            : false
      if (hidesActiveDetail) {
        setActiveDetail(null)
        if (restoreFocus) {
          queueMicrotask(() => {
            const trigger = detailTriggerRef.current
            if (trigger?.isConnected) trigger.focus()
            else timeFilterHeadingRef.current?.focus()
          })
        }
      }
      return {
        eventIds: nextVisibleEventIds,
        routeSegmentIds: nextVisibleRouteSegmentIds,
      }
    },
    [
      activeDetail,
      certaintyFilter.selectedRouteCertainties,
      organizationFilterResult.eventIds,
      organizationFilterResult.routeSegmentIds,
      selectedEventId,
      selectedRouteSegmentId,
    ],
  )

  const applyFilter = useCallback(() => {
    interruptPlayback()
    applyFilterState(draftFilter)
  }, [applyFilterState, draftFilter, interruptPlayback])

  const activateTimelineObject = useCallback(
    (
      objectType: TemporalObjectType,
      objectId: string,
      trigger: HTMLButtonElement,
      date?: string,
    ) => {
      if (date) interruptPlayback()
      else pausePlayback()
      const nextFilter = date
        ? { ...appliedFilter, referenceDate: date }
        : appliedFilter
      const nextResult = date
        ? applyFilterState(nextFilter, false)
        : {
            eventIds: visibleEventIds,
            routeSegmentIds: visibleRouteSegmentIds,
          }
      if (!nextResult) return
      const isVisible =
        objectType === 'event'
          ? nextResult.eventIds.has(objectId)
          : nextResult.routeSegmentIds.has(objectId)
      if (!isVisible) {
        setTimelineMessage(
          '目标事件在当前时间状态下不可见；已更新参考日期，但未绕过过滤强制高亮或打开详情。',
        )
        queueMicrotask(() => {
          if (trigger.isConnected) trigger.focus()
          else timeFilterHeadingRef.current?.focus()
        })
        return
      }
      setTimelineMessage(null)
      if (objectType === 'event') {
        const cancelling = selectedEventId === objectId
        setSelectedEventId(cancelling ? null : objectId)
        if (cancelling) closeDetail()
        else openDetail({ objectType: 'event', objectId }, trigger)
      } else {
        const cancelling = selectedRouteSegmentId === objectId
        setSelectedRouteSegmentId(cancelling ? null : objectId)
        if (cancelling) closeDetail()
        else openDetail({ objectType: 'route_segment', objectId }, trigger)
      }
    },
    [
      appliedFilter,
      applyFilterState,
      closeDetail,
      openDetail,
      selectedEventId,
      selectedRouteSegmentId,
      interruptPlayback,
      pausePlayback,
      visibleEventIds,
      visibleRouteSegmentIds,
    ],
  )

  const applyOrganizationSelection = useCallback(
    (nextSelectedIds: readonly string[], message: string | null) => {
      interruptPlayback()
      const nextOrganizationResult = buildOrganizationFilterResult(
        nextSelectedIds,
        eventDataset.events,
        routeDataset.routes,
        routeDataset.routeSegments,
        historyDataset,
      )
      const nextEventIds = combineOrganizationAndTimeVisibility(
        filterResult.eventIds,
        nextOrganizationResult.eventIds,
      )
      const nextRouteSegmentIds = filterRouteSegmentIdsByCertainty(
        combineOrganizationAndTimeVisibility(
          filterResult.routeSegmentIds,
          nextOrganizationResult.routeSegmentIds,
        ),
        routeDataset,
        certaintyFilter.selectedRouteCertainties,
      )
      setSelectedOrganizationIds(nextSelectedIds)
      setOrganizationSelectionMessage(message)
      const hidesEventSelection = Boolean(
        selectedEventId && !nextEventIds.has(selectedEventId),
      )
      const hidesRouteSelection = Boolean(
        selectedRouteSegmentId &&
        !nextRouteSegmentIds.has(selectedRouteSegmentId),
      )
      if (hidesEventSelection) setSelectedEventId(null)
      if (hidesRouteSelection) setSelectedRouteSegmentId(null)
      const hidesActiveDetail =
        activeDetail?.objectType === 'event'
          ? !nextEventIds.has(activeDetail.objectId)
          : activeDetail?.objectType === 'route_segment'
            ? !nextRouteSegmentIds.has(activeDetail.objectId)
            : false
      if (hidesActiveDetail) {
        setActiveDetail(null)
      }
      if (hidesActiveDetail || hidesEventSelection || hidesRouteSelection) {
        queueMicrotask(() => timeFilterHeadingRef.current?.focus())
      }
    },
    [
      activeDetail,
      certaintyFilter.selectedRouteCertainties,
      filterResult.eventIds,
      filterResult.routeSegmentIds,
      interruptPlayback,
      selectedEventId,
      selectedRouteSegmentId,
    ],
  )

  const toggleOrganization = useCallback(
    (organizationId: string, checked: boolean) => {
      const update = updateOrganizationSelection(
        selectedOrganizationIds,
        organizationId,
        checked,
      )
      if (update.rejected) {
        setOrganizationSelectionMessage(update.reason)
        return
      }
      applyOrganizationSelection(update.selectedIds, null)
    },
    [applyOrganizationSelection, selectedOrganizationIds],
  )

  const clearOrganizationFilter = useCallback(() => {
    applyOrganizationSelection([], null)
  }, [applyOrganizationSelection])

  const applyCertaintyFilter = useCallback(
    (nextFilter: CertaintyFilterState) => {
      interruptPlayback()
      const nextRouteSegmentIds = filterRouteSegmentIdsByCertainty(
        timeAndOrganizationRouteSegmentIds,
        routeDataset,
        nextFilter.selectedRouteCertainties,
      )
      setCertaintyFilter(nextFilter)
      const hidesRouteSelection = Boolean(
        selectedRouteSegmentId &&
        !nextRouteSegmentIds.has(selectedRouteSegmentId),
      )
      if (hidesRouteSelection) setSelectedRouteSegmentId(null)
      const hidesActiveDetail = Boolean(
        activeDetail?.objectType === 'route_segment' &&
        !nextRouteSegmentIds.has(activeDetail.objectId),
      )
      if (hidesActiveDetail) setActiveDetail(null)
      if (hidesRouteSelection || hidesActiveDetail) {
        queueMicrotask(() => timeFilterHeadingRef.current?.focus())
      }
    },
    [
      activeDetail,
      interruptPlayback,
      selectedRouteSegmentId,
      timeAndOrganizationRouteSegmentIds,
    ],
  )

  const clearFilter = useCallback(() => {
    interruptPlayback()
    const cleared = { status: 'all', referenceDate: '' } as const
    setDraftFilter(cleared)
    setAppliedFilter(cleared)
    setFilterError(null)
    setTimelineMessage(null)
  }, [interruptPlayback])

  const togglePlayback = useCallback(() => {
    if (playbackState.status === 'playing') {
      dispatchPlayback({ type: 'pause' })
      return
    }
    if (playbackState.status === 'paused' && playbackState.canResume) {
      dispatchPlayback({ type: 'resume' })
      return
    }
    if (playbackPlan.errors.length > 0) {
      dispatchPlayback({ type: 'fail', error: playbackPlan.errors[0] })
      return
    }
    if (appliedFilter.status === 'unknown') {
      dispatchPlayback({
        type: 'fail',
        error: {
          object_type: 'playback',
          object_id: 't10-playback',
          field: 'filter_status',
          code: 'UNKNOWN_TIME_NOT_PLAYABLE',
          reason: '时间未知（TU）对象不能进入日期或顺序播放。',
        },
      })
      return
    }
    const activePlan = { ...playbackPlan, steps: playbackSteps }
    const startIndex = findPlaybackStartIndex(
      activePlan,
      appliedFilter.referenceDate,
      appliedFilter.status === 'sequence_only',
    )
    if (startIndex === null) {
      dispatchPlayback({
        type: 'fail',
        error: {
          object_type: 'playback',
          object_id: 't10-playback',
          field: 'reference_date',
          code: 'NO_PLAYABLE_STEP',
          reason:
            '当前日期或过滤结果没有可继续的合法播放步骤；播放不会循环回到开头。',
        },
      })
      return
    }
    anchoredPlaybackStepRef.current = null
    dispatchPlayback({ type: 'start', stepIndex: startIndex })
  }, [appliedFilter, playbackPlan, playbackState, playbackSteps])

  const changePlaybackSpeed = useCallback((speed: PlaybackSpeed) => {
    dispatchPlayback({ type: 'set_speed', speed })
  }, [])

  useEffect(() => {
    if (playbackState.status !== 'playing' || !currentPlaybackStep) return

    if (
      currentPlaybackStep.kind === 'event_anchor' &&
      anchoredPlaybackStepRef.current !== currentPlaybackStep.stepId
    ) {
      anchoredPlaybackStepRef.current = currentPlaybackStep.stepId
      applyFilterState(
        { ...appliedFilter, referenceDate: currentPlaybackStep.date },
        false,
      )
    }

    if (
      currentPlaybackStep.kind === 'route_segment' &&
      !visibleRouteSegmentIds.has(currentPlaybackStep.routeSegmentId)
    ) {
      dispatchPlayback({
        type: 'skip',
        lastStepIndex: playbackSteps.length - 1,
      })
      return
    }

    const timer = window.setInterval(() => {
      dispatchPlayback({
        type: 'tick',
        amount:
          (PLAYBACK_TICK_MS * playbackState.speed) / PLAYBACK_BASE_STEP_MS,
        lastStepIndex: playbackSteps.length - 1,
      })
    }, PLAYBACK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [
    appliedFilter,
    applyFilterState,
    currentPlaybackStep,
    playbackState.speed,
    playbackState.status,
    playbackSteps.length,
    visibleRouteSegmentIds,
  ])

  const activeOrganizationMatchSource: OrganizationMatchSource | null =
    activeDetail?.objectType === 'event'
      ? (organizationFilterResult.eventMatches.get(activeDetail.objectId) ??
        null)
      : activeDetail?.objectType === 'route_segment'
        ? (organizationFilterResult.routeSegmentMatches.get(
            activeDetail.objectId,
          ) ?? null)
        : null

  return (
    <div className="app-shell">
      <AppHeader />
      <div className="app-body">
        <MainWorkspace
          placeDataset={placeDataset}
          eventDataset={visibleEventDataset}
          routeDataset={visibleRouteDataset}
          selectedEventId={selectedEventId}
          selectedRouteSegmentId={selectedRouteSegmentId}
          routePlayback={routePlayback}
          onSelectEvent={selectEvent}
          onSelectRouteSegment={selectRouteSegment}
          isTimeFiltered={appliedFilter.status !== 'all'}
          isOrganizationFiltered={organizationFilterResult.active}
          isCertaintyFiltered={
            certaintyFilter.selectedRouteCertainties.length !== 6
          }
          historyDataset={historyDataset}
          certaintyFilter={certaintyFilter}
          eventMatches={organizationFilterResult.eventMatches}
          routeSegmentMatches={organizationFilterResult.routeSegmentMatches}
          onOpenDetail={openDetailFromUser}
          onCloseDetail={closeDetail}
        />
        <FilterSidebar
          tree={organizationTree}
          relationsByOrganization={organizationRelations}
          selectedOrganizationIds={selectedOrganizationIds}
          selectionMessage={organizationSelectionMessage}
          visibleEventCount={visibleEventIds.size}
          visibleRouteSegmentCount={visibleRouteSegmentIds.size}
          onToggleOrganization={toggleOrganization}
          onClearOrganizations={clearOrganizationFilter}
          certaintyFilter={certaintyFilter}
          onCertaintyFilterChange={applyCertaintyFilter}
          onOpenDetail={openDetailFromUser}
        />
        <InfoPanel
          activeDetail={activeDetail}
          placeDataset={placeDataset}
          eventDataset={eventDataset}
          organizationDataset={organizationDataset}
          routeDataset={routeDataset}
          historyDataset={historyDataset}
          organizationMatchSource={activeOrganizationMatchSource}
          certaintyFilter={certaintyFilter}
          onCloseDetail={closeDetail}
          onOpenDetail={openDetailFromUser}
        />
      </div>
      <TimelinePanel
        draftFilter={draftFilter}
        appliedFilter={appliedFilter}
        error={filterError}
        message={timelineMessage}
        timelineView={timelineView}
        allEvents={eventDataset.events}
        selectedEventId={selectedEventId}
        selectedRouteSegmentId={selectedRouteSegmentId}
        visibleEventCount={visibleEventIds.size}
        totalEventCount={eventDataset.events.length}
        visibleRouteSegmentCount={visibleRouteSegmentIds.size}
        totalRouteSegmentCount={routeDataset.routeSegments.length}
        headingRef={timeFilterHeadingRef}
        onDraftChange={(patch) => {
          interruptPlayback()
          setDraftFilter((current) => ({ ...current, ...patch }))
          setFilterError(null)
        }}
        onApply={applyFilter}
        onClear={clearFilter}
        onReferenceDateChange={(date) => {
          interruptPlayback()
          applyFilterState({ ...appliedFilter, referenceDate: date })
        }}
        onActivate={activateTimelineObject}
        playbackState={playbackState}
        currentPlaybackStep={currentPlaybackStep}
        playbackError={playbackState.error?.reason ?? null}
        onTogglePlayback={togglePlayback}
        onPlaybackSpeedChange={changePlaybackSpeed}
      />
    </div>
  )
}
