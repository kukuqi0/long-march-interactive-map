import type { ReviewStatus } from './place'

export type DetailObjectType =
  'place' | 'event' | 'route_segment' | 'organization' | 'person'

export interface ActiveDetail {
  objectType: DetailObjectType
  objectId: string
}

export interface DetailError {
  object_type: DetailObjectType
  object_id: string
  field: string
  code: string
  reason: string
}

export interface PersonDetailRecord {
  person_id: string
  canonical_name: string
  aliases?: string[] | null
  description?: string | null
  review_status: ReviewStatus
  created_at?: string
  updated_at?: string
  data_version?: string
}

export type OpenDetail = (detail: ActiveDetail, trigger: HTMLElement) => void
