import { useState } from 'react'
import type { OpenDetail } from '../../types/detail'
import type {
  OrganizationRelationView,
  OrganizationTreeNode,
} from '../../types/organizationFilter'
import type { CertaintyFilterState } from '../../types/certaintyFilter'
import {
  routeCertainties,
  routeCertaintyPresentation,
  type RouteCertainty,
} from '../../types/route'

interface FilterSidebarProps {
  tree: readonly OrganizationTreeNode[]
  relationsByOrganization: ReadonlyMap<
    string,
    readonly OrganizationRelationView[]
  >
  selectedOrganizationIds: readonly string[]
  selectionMessage: string | null
  visibleEventCount: number
  visibleRouteSegmentCount: number
  onToggleOrganization: (organizationId: string, checked: boolean) => void
  onClearOrganizations: () => void
  certaintyFilter: CertaintyFilterState
  onCertaintyFilterChange: (filter: CertaintyFilterState) => void
  onOpenDetail: OpenDetail
}

const remainingPlaceholders = ['事件类型（未实现）']

const certaintyShortLabels: Record<RouteCertainty, string> = {
  R1: '可靠路线 / 实线',
  R2: '地点序列推定 / 长虚线',
  R3: '大致通道 / 半透明廊道',
  R4: '争议路线 / A-B方案',
  R5: '中间路径未知 / 不画连接线',
  RU: '路线完全未知 / 无几何',
}

function RelationList({
  relations,
}: {
  relations: readonly OrganizationRelationView[]
}) {
  if (relations.length === 0)
    return <p className="organization-filter__empty">名称沿革尚未建立。</p>
  return (
    <ul className="organization-filter__relations">
      {relations.map((relation) => (
        <li key={relation.relationId}>
          <strong>{relation.validFrom ?? '日期未知'}</strong>：
          {relation.subjectName} {relation.label} {relation.objectName}
          {relation.validTo
            ? `；有效至${relation.validTo}之前`
            : '；结束时间未知'}
        </li>
      ))}
    </ul>
  )
}

function OrganizationNode({
  node,
  relationsByOrganization,
  selectedOrganizationIds,
  expandedIds,
  onToggleExpanded,
  onToggleOrganization,
  onOpenDetail,
}: {
  node: OrganizationTreeNode
  relationsByOrganization: FilterSidebarProps['relationsByOrganization']
  selectedOrganizationIds: readonly string[]
  expandedIds: ReadonlySet<string>
  onToggleExpanded: (organizationId: string) => void
  onToggleOrganization: FilterSidebarProps['onToggleOrganization']
  onOpenDetail: OpenDetail
}) {
  const expanded = expandedIds.has(node.organizationId)
  const hasChildren = node.children.length > 0
  const relations = relationsByOrganization.get(node.organizationId) ?? []
  return (
    <li className="organization-tree__item">
      <div className="organization-tree__row">
        {hasChildren ? (
          <button
            type="button"
            className="organization-tree__expand"
            aria-expanded={expanded}
            aria-label={`${expanded ? '收起' : '展开'}${node.baseName}聚合成员`}
            onClick={() => onToggleExpanded(node.organizationId)}
          >
            {expanded ? '−' : '+'}
          </button>
        ) : (
          <span className="organization-tree__indent" aria-hidden="true" />
        )}
        <label>
          <input
            type="checkbox"
            checked={selectedOrganizationIds.includes(node.organizationId)}
            onChange={(event) =>
              onToggleOrganization(node.organizationId, event.target.checked)
            }
          />
          <span>
            <strong>{node.displayName}</strong>
            <small className="organization-tree__badge">
              {node.aggregate ? '产品聚合' : '历史组织'}
            </small>
          </span>
        </label>
        <button
          type="button"
          className="organization-tree__detail"
          onClick={(event) =>
            onOpenDetail(
              { objectType: 'organization', objectId: node.organizationId },
              event.currentTarget,
            )
          }
        >
          详情
        </button>
      </div>
      {node.activeAtReferenceDate === false ? (
        <p className="organization-tree__state" role="status">
          当前日期无有效组织实例；仍可作为历史筛选维度使用。
        </p>
      ) : node.activeAtReferenceDate === null && !node.aggregate ? (
        <p className="organization-tree__state">未设置参考日期。</p>
      ) : null}
      {!node.aggregate ? (
        <details className="organization-filter__lineage">
          <summary>名称沿革</summary>
          <RelationList relations={relations} />
        </details>
      ) : (
        <p className="organization-tree__state">
          此处分组用于专题浏览，不代表历史时期的正式建制隶属关系。
        </p>
      )}
      {hasChildren && expanded ? (
        <ul className="organization-tree organization-tree--children">
          {node.children.map((child) => (
            <OrganizationNode
              key={child.organizationId}
              node={child}
              relationsByOrganization={relationsByOrganization}
              selectedOrganizationIds={selectedOrganizationIds}
              expandedIds={expandedIds}
              onToggleExpanded={onToggleExpanded}
              onToggleOrganization={onToggleOrganization}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function FilterSidebar({
  tree,
  relationsByOrganization,
  selectedOrganizationIds,
  selectionMessage,
  visibleEventCount,
  visibleRouteSegmentCount,
  onToggleOrganization,
  onClearOrganizations,
  certaintyFilter,
  onCertaintyFilterChange,
  onOpenDetail,
}: FilterSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        tree
          .filter((node) => node.children.length)
          .map((node) => node.organizationId),
      ),
  )
  const active = selectedOrganizationIds.length > 0
  return (
    <aside
      className={`layout-panel filter-sidebar ${mobileOpen ? 'filter-sidebar--mobile-open' : ''}`}
      aria-labelledby="filter-sidebar-title"
    >
      {mobileOpen ? (
        <button
          type="button"
          className="filter-sidebar__backdrop"
          aria-label="关闭筛选抽屉"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <button
        type="button"
        className="filter-sidebar__mobile-toggle"
        aria-expanded={mobileOpen}
        aria-controls="filter-sidebar-content"
        onClick={() => setMobileOpen((open) => !open)}
      >
        <span>{mobileOpen ? '收起筛选与图例' : '打开筛选与图例'}</span>
        <small>
          组织 {selectedOrganizationIds.length}/4 · 路线确定性{' '}
          {certaintyFilter.selectedRouteCertainties.length}/6
        </small>
      </button>
      <div id="filter-sidebar-content" className="filter-sidebar__content">
        <div className="panel-heading">
          <p className="panel-kicker">部队筛选</p>
          <h2 id="filter-sidebar-title">筛选区域</h2>
        </div>
        <section
          className="organization-filter"
          aria-labelledby="organization-filter-title"
        >
          <div className="organization-filter__heading">
            <div>
              <h3 id="organization-filter-title">组织/部队</h3>
              <p aria-live="polite">
                已选 {selectedOrganizationIds.length} 项（最多4项）
              </p>
            </div>
            <button
              type="button"
              onClick={onClearOrganizations}
              disabled={!active}
            >
              清除部队筛选
            </button>
          </div>
          <p className="organization-filter__notice">
            未选择时显示全部组织。多个选择将合并显示结果。
          </p>
          {selectionMessage ? (
            <p className="organization-filter__message" role="status">
              {selectionMessage}
            </p>
          ) : null}
          <ul className="organization-tree" aria-label="组织筛选树">
            {tree.map((node) => (
              <OrganizationNode
                key={node.organizationId}
                node={node}
                relationsByOrganization={relationsByOrganization}
                selectedOrganizationIds={selectedOrganizationIds}
                expandedIds={expandedIds}
                onToggleExpanded={(organizationId) =>
                  setExpandedIds((current) => {
                    const next = new Set(current)
                    if (next.has(organizationId)) next.delete(organizationId)
                    else next.add(organizationId)
                    return next
                  })
                }
                onToggleOrganization={onToggleOrganization}
                onOpenDetail={onOpenDetail}
              />
            ))}
          </ul>
          <p className="organization-filter__result" role="status">
            当前共享结果：事件 {visibleEventCount}，路线段{' '}
            {visibleRouteSegmentCount}。
          </p>
          {active && visibleRouteSegmentCount === 0 ? (
            <p className="organization-filter__empty">
              当前样例没有直接归属于所选组织的路线数据；这不表示历史上没有路线。
            </p>
          ) : null}
          {active && visibleEventCount === 0 ? (
            <p className="organization-filter__empty">
              当前筛选组合暂无匹配事件；这不表示历史活动不存在。
            </p>
          ) : null}
        </section>
        <section
          className="certainty-filter"
          aria-labelledby="certainty-filter-title"
        >
          <div className="organization-filter__heading">
            <div>
              <h3 id="certainty-filter-title">确定性 / 争议</h3>
              <p>
                已显示 {certaintyFilter.selectedRouteCertainties.length}/6
                类路线确定性。
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onCertaintyFilterChange({
                  ...certaintyFilter,
                  selectedRouteCertainties: routeCertainties,
                })
              }
              disabled={certaintyFilter.selectedRouteCertainties.length === 6}
            >
              恢复全部确定性
            </button>
          </div>
          <p className="organization-filter__notice">
            资料未知/不足（R5、RU）与存在竞争说法（R4）严格分离；确定性不使用百分比评分。
          </p>
          <fieldset className="certainty-filter__choices">
            <legend>路线确定性</legend>
            {routeCertainties.map((certainty) => (
              <label key={certainty}>
                <input
                  type="checkbox"
                  checked={certaintyFilter.selectedRouteCertainties.includes(
                    certainty,
                  )}
                  onChange={(event) => {
                    const selected = new Set(
                      certaintyFilter.selectedRouteCertainties,
                    )
                    if (event.target.checked) selected.add(certainty)
                    else selected.delete(certainty)
                    onCertaintyFilterChange({
                      ...certaintyFilter,
                      selectedRouteCertainties: routeCertainties.filter(
                        (item) => selected.has(item),
                      ),
                    })
                  }}
                />
                <span>
                  <strong>{certainty}</strong> {certaintyShortLabels[certainty]}
                </span>
              </label>
            ))}
          </fieldset>
          <label className="certainty-filter__alternative-toggle">
            <input
              type="checkbox"
              checked={certaintyFilter.showDisputedAlternatives}
              onChange={(event) =>
                onCertaintyFilterChange({
                  ...certaintyFilter,
                  showDisputedAlternatives: event.target.checked,
                })
              }
            />
            <span>
              <strong>显示争议/低可信替代内容</strong>
              <small>默认关闭；不控制C-U资料不足内容。</small>
            </span>
          </label>
          <fieldset
            className="certainty-filter__variants"
            disabled={!certaintyFilter.showDisputedAlternatives}
          >
            <legend>R4当前查看方案</legend>
            {(['A', 'B', 'both'] as const).map((variant) => (
              <label key={variant}>
                <input
                  type="radio"
                  name="r4-route-variant"
                  checked={certaintyFilter.routeVariantView === variant}
                  onChange={() =>
                    onCertaintyFilterChange({
                      ...certaintyFilter,
                      routeVariantView: variant,
                    })
                  }
                />
                {variant === 'both' ? 'A+B并列' : `方案${variant}`}
              </label>
            ))}
          </fieldset>
          <p className="certainty-filter__sample-warning">
            当前R4为争议方案演示，仍待史料核验；A/B未作裁定，不平均、不融合。
          </p>
          <div className="certainty-legend" aria-label="R1至RU路线确定性图例">
            {routeCertainties.map((certainty) => (
              <span key={certainty}>
                <i
                  className={`route-list__swatch route-list__swatch--${certainty.toLowerCase()}`}
                  aria-hidden="true"
                />
                <strong>{certaintyShortLabels[certainty]}</strong>
                <small>{routeCertaintyPresentation[certainty].visual}</small>
              </span>
            ))}
          </div>
        </section>
        <div className="placeholder-list" aria-label="尚未实现的筛选分组">
          {remainingPlaceholders.map((group) => (
            <section className="placeholder-list__item" key={group}>
              <h3>{group}</h3>
              <p>仅展示未来信息层级，不提供操作控件。</p>
            </section>
          ))}
        </div>
      </div>
    </aside>
  )
}
