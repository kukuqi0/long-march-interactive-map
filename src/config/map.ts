import type { StyleSpecification } from 'maplibre-gl'
import blankStyleJson from '../map/styles/blank-style.json'

export const mapConfig = {
  provider: {
    id: 'openfreemap',
    name: 'OpenFreeMap Positron',
    styleUrl: 'https://tiles.openfreemap.org/styles/positron',
    attributionHtml:
      '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>',
  },
  blankStyle: blankStyleJson as StyleSpecification,
  initialView: {
    center: [104, 35] as [number, number],
    zoom: 3.2,
    minZoom: 1.5,
    maxZoom: 17,
  },
  errorPolicy: {
    onlineLoadTimeoutMs: 12_000,
    criticalResourceErrorThreshold: 2,
  },
  messages: {
    loading: '地图加载中',
    online: '在线底图',
    degraded: '底图暂不可用，已切换为无底图模式',
    fatal: '地图组件暂不可用',
    resourceWarning: '部分在线底图资源暂时不可用',
    blankMode: '无底图模式仍可缩放和平移',
  },
} as const

export type MapStatus = 'loading' | 'online' | 'degraded' | 'fatal'
