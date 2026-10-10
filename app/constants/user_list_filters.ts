/**
 * Filtros del listado de usuarios del tenant (`GET /api/users`, VLRH-H1791581963402).
 *
 * El estatus de acceso se deriva de dos columnas de `users`:
 *  - `pending`:   `user_password_set_at` nulo (la invitación no se ha aceptado), sin importar `user_active`.
 *  - `active`:    `user_active = 1` con la contraseña ya establecida.
 *  - `suspended`: `user_active = 0` con la contraseña ya establecida.
 *  - `all`:       sin filtro (default; conserva el comportamiento previo).
 */
export const USER_ACCESS_STATUSES = ['all', 'active', 'suspended', 'pending'] as const
export type UserAccessStatus = (typeof USER_ACCESS_STATUSES)[number]
export const USER_ACCESS_STATUS_DEFAULT: UserAccessStatus = 'all'

/**
 * Orden del listado por nombre completo de la persona. Sin `sort`, el listado
 * conserva su orden histórico por `user_id`.
 */
export const USER_LIST_SORTS = ['name_asc', 'name_desc'] as const
export type UserListSort = (typeof USER_LIST_SORTS)[number]

/** Dirección SQL de cada orden: la dirección nunca sale del input crudo. */
export const USER_LIST_SORT_DIRECTION: Record<UserListSort, 'asc' | 'desc'> = {
  name_asc: 'asc',
  name_desc: 'desc',
}
