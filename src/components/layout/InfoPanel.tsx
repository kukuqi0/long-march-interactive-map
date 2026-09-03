interface InfoPanelProps {
  activeDetail: ActiveDetail | null
  placeDataset: LoadedPlaceDataset
  eventDataset: LoadedEventDataset
  organizationDataset: LoadedOrganizationDataset
  routeDataset: LoadedRouteDataset
  historyDataset: LoadedHistoryDataset
  organizationMatchSource: OrganizationMatchSource | null
  certaintyFilter: CertaintyFilterState
  onCloseDetail: () => void
  onOpenDetail: OpenDetail
}

export function InfoPanel({
  activeDetail,
  placeDataset,
  eventDataset,
  organizationDataset,
  routeDataset,
  historyDataset,
  organizationMatchSource,
  certaintyFilter,
  onCloseDetail,
  onOpenDetail,
}: InfoPanelProps) {
  return (
    <aside
      className={`layout-panel info-panel ${activeDetail ? 'info-panel--active' : ''}`}
      aria-label="详情区域"
    >
      {activeDetail ? (
        <>
          <button
            type="button"
            className="info-panel__backdrop"
            aria-label="关闭对象详情抽屉"
            onClick={onCloseDetail}
          />
          <DetailDrawer
            active={activeDetail}
            places={placeDataset}
            events={eventDataset}
            organizations={organizationDataset}
            routes={routeDataset}
            history={historyDataset}
            organizationMatchSource={organizationMatchSource}
            certaintyFilter={certaintyFilter}
            onClose={onCloseDetail}
            onOpenDetail={onOpenDetail}
          />
        </>
      ) : (
        <section
          className="info-panel__empty"
          aria-labelledby="info-panel-title"
        >
          <div className="panel-heading">
            <h2 id="info-panel-title">详情</h2>
          </div>
          <p>选择地图中的地点、事件或路线查看详细信息。</p>
        </section>
      )}
    </aside>
  )
}
import { DetailDrawer } from '../details/DetailDrawer'
import type { ActiveDetail, OpenDetail } from '../../types/detail'
import type { LoadedEventDataset } from '../../types/event'
import type { LoadedOrganizationDataset } from '../../types/organization'
import type { LoadedPlaceDataset } from '../../types/place'
import type { LoadedRouteDataset } from '../../types/route'
import type { LoadedHistoryDataset } from '../../types/history'
import type { OrganizationMatchSource } from '../../types/history'
import type { CertaintyFilterState } from '../../types/certaintyFilter'
