import type { UserAccessStatus, UserListSort } from '#constants/user_list_filters'

interface UserFilterSearchInterface {
  search: string
  roleId: number
  businessUnitId: number
  page: number
  limit: number
  /** Estatus de acceso; sin valor equivale a `all`. */
  accessStatus?: UserAccessStatus
  /** Orden por nombre de la persona; sin valor se ordena por `user_id`. */
  sort?: UserListSort
}

export type { UserFilterSearchInterface }
