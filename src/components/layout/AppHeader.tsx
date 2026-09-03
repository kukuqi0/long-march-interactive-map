export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header__identity">
        <p className="app-header__eyebrow">1934—1936年红军长征专题地图</p>
        <h1>红军长征专题交互地图</h1>
        <p className="app-header__status">
          数据说明：本专题目前仍在资料整理与核验阶段，部分地点、路线及组织信息可能继续修订。
        </p>
      </div>
      <div className="app-header__version" aria-label="专题范围">
        <p>交互地图原型</p>
        <strong>资料持续整理中</strong>
      </div>
    </header>
  )
}
