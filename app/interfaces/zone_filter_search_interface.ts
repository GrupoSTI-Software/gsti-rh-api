import type { ZoneSort } from '#constants/zone_sort'

export interface ZoneFilterSearchInterface {
  search?: string
  page: number
  limit: number
  /** Sin valor, el listado sale por fecha de alta. */
  sort?: ZoneSort | null
}
