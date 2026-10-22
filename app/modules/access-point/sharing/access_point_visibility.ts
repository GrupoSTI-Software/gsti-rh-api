import type { AccessPointRole } from './access_point_scope.port.js'

/**
 * Regla de visibilidad del checador compartido (VLRH-P0065, 6): fuente unica
 * de "quien ve un checador" y de "que checadores lista una empresa".
 *
 * Es dominio puro: no lee la BD ni importa Lucid. El adaptador del scope lee
 * el aparato y sus participantes y delega aqui la decision.
 */

/** La responsable del aparato esta en el alcance de la peticion. */
export function ownsAccessPoint(ownerBusinessUnitId: number, requestScope: number[]): boolean {
  return requestScope.includes(ownerBusinessUnitId)
}

/**
 * Papel de la peticion sobre un checador: `owner` si la responsable esta en el
 * alcance; `guest` si alguna empresa del alcance esta en el scope del aparato
 * (`participants`, o el del canal con `includeLingering`); `null` si no lo ve.
 * Falla cerrado: un alcance vacio no ve nada.
 */
export function accessPointRoleOf(
  ownerBusinessUnitId: number,
  deviceScope: number[],
  requestScope: number[]
): AccessPointRole | null {
  if (requestScope.length === 0) return null
  if (ownsAccessPoint(ownerBusinessUnitId, requestScope)) return 'owner'
  return deviceScope.some((id) => requestScope.includes(id)) ? 'guest' : null
}

/** Lo minimo que `whereVisibleTo` necesita de un query builder. */
export interface VisibilityQuery {
  whereIn: (column: string, values: number[]) => unknown
  orWhereIn: (column: string, values: number[]) => unknown
}

/**
 * Predicado de las listas: las filas de las empresas propias y las de los
 * aparatos compartidos con ellas. Va dentro de un `where(...)` agrupado para
 * que el `OR` no escape del resto de los filtros. Cada lista decide su alcance
 * de entrada y corta antes si viene vacio.
 */
export function whereVisibleTo(
  query: VisibilityQuery,
  ownedScope: number[],
  sharedIds: number[]
): void {
  query.whereIn('business_unit_id', ownedScope)
  if (sharedIds.length > 0) query.orWhereIn('access_point_id', sharedIds)
}
