import {
  eventTypePresentation,
  eventTypes,
  type EventType,
} from '../../types/event'

export interface LocalEventIcon {
  width: number
  height: number
  data: Uint8Array
}

function insideShape(type: EventType, x: number, y: number, size: number) {
  const center = (size - 1) / 2
  const dx = x - center
  const dy = y - center
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)

  switch (type) {
    case 'battle':
      return ax <= 2 || ay <= 2 || Math.abs(ax - ay) <= 1
    case 'meeting':
      return (
        (ax >= 7 && ax <= 9 && ay <= 9) ||
        (ay >= 7 && ay <= 9 && ax <= 9) ||
        (ay <= 1 && ax <= 6)
      )
    case 'movement':
      return dy >= -9 && dy <= 8 && ay + ax * 0.75 <= 9
    case 'river_crossing':
      return (
        Math.abs(ax + ay - 9) <= 1.5 ||
        (Math.abs(dy - Math.sin(dx / 2) * 2) <= 1 && ax <= 6)
      )
    case 'mountain_crossing':
      return (
        (dy >= -7 && dy <= 7 && Math.abs(dx + 5) + dy <= 6 && dx < 1) ||
        (dy >= -5 && dy <= 7 && Math.abs(dx - 5) + dy <= 7 && dx > -1)
      )
    case 'rendezvous': {
      const left = Math.hypot(dx + 5, dy)
      const right = Math.hypot(dx - 5, dy)
      return (left >= 4 && left <= 7) || (right >= 4 && right <= 7)
    }
    case 'stay': {
      const radius = Math.hypot(dx, dy)
      return (radius >= 7 && radius <= 9) || (ax <= 3 && ay <= 3)
    }
    case 'reorganization':
      return (
        (ax <= 8 && ay <= 9 && ax + ay <= 13 && (ax >= 6 || ay >= 7)) ||
        (ax <= 5 && (Math.abs(dy - 2) <= 1 || Math.abs(dy + 2) <= 1))
      )
    case 'other':
      return (
        Math.abs(ax + ay - 9) <= 1.5 ||
        (ax <= 1 && ay <= 5) ||
        (ay <= 1 && ax <= 5)
      )
  }
}

export function createEventIcon(type: EventType, selected = false) {
  const size = selected ? 32 : 26
  const data = new Uint8Array(size * size * 4)
  const center = (size - 1) / 2

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4
      const radius = Math.hypot(x - center, y - center)
      const selectionRing =
        selected && radius >= size / 2 - 3 && radius <= size / 2 - 1
      const shapePixel = insideShape(type, x, y, size)
      if (!selectionRing && !shapePixel) {
        continue
      }

      const color = selectionRing ? [255, 246, 194] : [92, 29, 24]
      data[index] = color[0]
      data[index + 1] = color[1]
      data[index + 2] = color[2]
      data[index + 3] = 255
    }
  }

  return { width: size, height: size, data } satisfies LocalEventIcon
}

export function registerEventIcons(map: {
  hasImage: (id: string) => boolean
  addImage: (id: string, image: LocalEventIcon) => unknown
}) {
  for (const type of eventTypes) {
    const iconId = eventTypePresentation[type].iconId
    if (!map.hasImage(iconId)) {
      map.addImage(iconId, createEventIcon(type))
    }
    const selectedId = `${iconId}-selected`
    if (!map.hasImage(selectedId)) {
      map.addImage(selectedId, createEventIcon(type, true))
    }
  }
}
