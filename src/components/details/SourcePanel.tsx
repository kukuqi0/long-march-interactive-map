import { useState } from 'react'
import type { DetailObjectType } from '../../types/detail'
import type {
  Claim,
  EvidenceLink,
  EvidenceRelation,
  LoadedHistoryDataset,
  Source,
} from '../../types/history'
import {
  claimPredicatePresentation,
  evidenceRelationPresentation,
  getClaimsForObject,
  getClaimsForSource,
  getEvidenceForClaim,
  getSourceForEvidence,
  groupEvidenceByRelation,
  resolveClaimTraceabilityStatus,
  resolveEvidenceLocatorStatus,
  resolveSourceQualityDisplay,
  resolveSourceTypeDisplay,
} from '../../utils/sourcePanel'
import { resolveClaimConfidencePresentation } from '../../utils/certaintyFilter'

interface SourcePanelProps {
  history: LoadedHistoryDataset
  objectType: DetailObjectType
  objectId: string
}

const evidenceOrder: readonly EvidenceRelation[] = [
  'supports',
  'contradicts',
  'background',
]

function displayValue(value: string | number | null) {
  return value === null || value === '' ? '未录入' : String(value)
}

function SourceCard({
  source,
  history,
  instanceId,
}: {
  source: Readonly<Source>
  history: LoadedHistoryDataset
  instanceId: string
}) {
  const [showClaims, setShowClaims] = useState(false)
  const references = getClaimsForSource(history, source.source_id)
  const reverseId = `source-references-${source.source_id}-${instanceId}`
  return (
    <article className="source-card" aria-label={`来源：${source.title}`}>
      <h6>{source.title}</h6>
      <dl className="source-panel__fields">
        <div>
          <dt>source_id</dt>
          <dd className="source-panel__token">{source.source_id}</dd>
        </div>
        <div>
          <dt>来源类型</dt>
          <dd>{resolveSourceTypeDisplay(source.source_type)}</dd>
        </div>
        <div>
          <dt>责任者</dt>
          <dd>{displayValue(source.creator)}</dd>
        </div>
        <div>
          <dt>版次</dt>
          <dd>{displayValue(source.edition)}</dd>
        </div>
        <div>
          <dt>形成/出版年</dt>
          <dd>{displayValue(source.publication_year)}</dd>
        </div>
        <div>
          <dt>出版者/馆藏</dt>
          <dd>{displayValue(source.publisher_or_archive)}</dd>
        </div>
        <div>
          <dt>来源质量</dt>
          <dd>{resolveSourceQualityDisplay(source.source_quality)}</dd>
        </div>
        <div>
          <dt>审核状态</dt>
          <dd>
            {source.review_status === 'draft' ? '待核验' : source.review_status}
          </dd>
        </div>
        <div>
          <dt>公开访问</dt>
          <dd>
            {source.public_url ? (
              <a
                className="source-card__public-link"
                href={source.public_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`打开公开来源：${source.title}`}
              >
                打开公开来源
              </a>
            ) : (
              '无公开链接'
            )}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        className="source-panel__toggle"
        aria-expanded={showClaims}
        aria-controls={reverseId}
        onClick={() => setShowClaims((current) => !current)}
      >
        查看关联声明（{references.length}）
      </button>
      {showClaims ? (
        <div id={reverseId} className="source-card__references">
          {references.length ? (
            <ul>
              {references.map(({ claim, evidence }) => (
                <li key={`${claim.claim_id}:${evidence.evidence_link_id}`}>
                  <span className="source-panel__token">{claim.claim_id}</span>
                  {' · '}
                  {claimPredicatePresentation[claim.predicate]}
                  {' · '}
                  {claim.subject_type}：
                  <span className="source-panel__token">
                    {claim.subject_id}
                  </span>
                  {' · '}
                  {evidenceRelationPresentation[evidence.evidence_relation]}
                  {' · '}
                  {resolveEvidenceLocatorStatus(evidence.locator).label}
                </li>
              ))}
            </ul>
          ) : (
            <p>暂无关联声明。</p>
          )}
        </div>
      ) : null}
    </article>
  )
}

function EvidenceCard({
  evidence,
  history,
}: {
  evidence: Readonly<EvidenceLink>
  history: LoadedHistoryDataset
}) {
  const source = getSourceForEvidence(history, evidence)
  const locator = resolveEvidenceLocatorStatus(evidence.locator)
  return (
    <li
      className={`evidence-card evidence-card--${evidence.evidence_relation}`}
    >
      <p className="evidence-card__relation">
        {evidenceRelationPresentation[evidence.evidence_relation]}证据
      </p>
      <dl className="source-panel__fields">
        <div>
          <dt>evidence_link_id</dt>
          <dd className="source-panel__token">{evidence.evidence_link_id}</dd>
        </div>
        <div>
          <dt>定位</dt>
          <dd>
            <strong>{locator.label}</strong>
            {'：'}
            {evidence.locator ?? '未提供页码、档号、图幅或稳定网页定位'}
          </dd>
        </div>
        {!locator.complete ? (
          <div className="source-panel__locator-warning" role="note">
            <dt>发布定位门槛</dt>
            <dd>{locator.publicationMessage}</dd>
          </div>
        ) : null}
        <div>
          <dt>原文短摘</dt>
          <dd>{evidence.excerpt ?? '未录入短摘'}</dd>
        </div>
        <div>
          <dt>项目解释边界</dt>
          <dd>{evidence.interpretation_note ?? '未录入解释边界'}</dd>
        </div>
        <div>
          <dt>审核状态</dt>
          <dd>
            {evidence.review_status === 'draft'
              ? '待核验'
              : evidence.review_status}
          </dd>
        </div>
      </dl>
      {source ? (
        <SourceCard
          source={source}
          history={history}
          instanceId={evidence.evidence_link_id}
        />
      ) : (
        <p role="alert">来源外键未解析，未使用私有文件位置回退。</p>
      )}
    </li>
  )
}

function ClaimItem({
  claim,
  history,
}: {
  claim: Readonly<Claim>
  history: LoadedHistoryDataset
}) {
  const [expanded, setExpanded] = useState(false)
  const evidence = getEvidenceForClaim(history, claim.claim_id)
  const groups = groupEvidenceByRelation(evidence)
  const contentId = `claim-evidence-${claim.claim_id}`
  const traceability = resolveClaimTraceabilityStatus(
    claim,
    evidence,
    history.sources,
    history.manifest,
  )
  return (
    <li className="claim-card">
      <h5>{claimPredicatePresentation[claim.predicate]}</h5>
      <dl className="source-panel__fields">
        <div>
          <dt>claim_id</dt>
          <dd className="source-panel__token">{claim.claim_id}</dd>
        </div>
        <div>
          <dt>predicate</dt>
          <dd>{claim.predicate}</dd>
        </div>
        <div>
          <dt>object</dt>
          <dd className="source-panel__token">
            {claim.object_type}：{displayValue(claim.object_value)}
          </dd>
        </div>
        <div>
          <dt>资料状态</dt>
          <dd>{claim.claim_data_state}</dd>
        </div>
        <div>
          <dt>可信等级</dt>
          <dd>
            <span
              className={`detail-confidence detail-confidence--${claim.claim_confidence.toLowerCase()}`}
            >
              {claim.claim_confidence}
            </span>{' '}
            ·{' '}
            {
              resolveClaimConfidencePresentation(claim.claim_confidence)
                .description
            }
          </dd>
        </div>
        <div>
          <dt>时间精度</dt>
          <dd>{displayValue(claim.time_precision)}</dd>
        </div>
        <div>
          <dt>空间精度</dt>
          <dd>{displayValue(claim.spatial_precision)}</dd>
        </div>
        <div>
          <dt>审核状态</dt>
          <dd>
            {claim.review_status === 'draft' ? '待核验' : claim.review_status}
          </dd>
        </div>
        <div>
          <dt>证据计数</dt>
          <dd>
            共{evidence.length}；支持{groups.supports.length}；反对
            {groups.contradicts.length}；背景{groups.background.length}
          </dd>
        </div>
        <div>
          <dt>发布追溯状态</dt>
          <dd>{traceability.label}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="source-panel__toggle"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? '收起来源' : `查看来源（${evidence.length}）`}
      </button>
      {expanded ? (
        <div id={contentId} className="claim-card__evidence">
          {evidence.length === 0 ? (
            <p className="source-panel__empty-evidence" role="status">
              暂无史料证据链接。
            </p>
          ) : null}
          {claim.predicate === 'route_geometry_variant' &&
          evidence.length === 0 ? (
            <p className="detail-warning">
              该争议方案目前没有史料证据链接；这不是加载失败。
            </p>
          ) : null}
          {evidenceOrder.map((relation) => {
            const items = groups[relation]
            return (
              <section
                key={relation}
                className="evidence-group"
                aria-labelledby={`${contentId}-${relation}`}
              >
                <h6 id={`${contentId}-${relation}`}>
                  {evidenceRelationPresentation[relation]}（{items.length}）
                </h6>
                {items.length ? (
                  <ul>
                    {items.map((item) => (
                      <EvidenceCard
                        key={item.evidence_link_id}
                        evidence={item}
                        history={history}
                      />
                    ))}
                  </ul>
                ) : (
                  <p>
                    当前声明没有{evidenceRelationPresentation[relation]}证据。
                  </p>
                )}
              </section>
            )
          })}
        </div>
      ) : null}
    </li>
  )
}

export function SourcePanel({
  history,
  objectType,
  objectId,
}: SourcePanelProps) {
  const claims = getClaimsForObject(history, objectType, objectId)
  return (
    <section
      className="detail-section source-panel"
      aria-labelledby="detail-source-panel-title"
    >
      <h4 id="detail-source-panel-title">声明与史料来源</h4>
      <p>
        来源只通过claim ↔ evidence_link ↔
        source链展示，不直接挂到对象或整个页面。
      </p>
      {claims.length ? (
        <ul className="source-panel__claims">
          {claims.map((claim) => (
            <ClaimItem key={claim.claim_id} claim={claim} history={history} />
          ))}
        </ul>
      ) : (
        <p role="status">暂无关联声明</p>
      )}
      <p className="source-panel__method-note">
        版权受限材料仅展示必要书目信息与短摘；私有文件位置不对外展示。
      </p>
    </section>
  )
}
