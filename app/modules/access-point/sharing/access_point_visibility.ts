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

/** El grupo entre parentesis donde vive el `OR` del predicado. */
export interface VisibilityGroup {
  whereIn(column: string, values: number[]): unknown
  orWhereIn(column: string, values: number[]): unknown
}

/** Lo minimo que `whereVisibleTo` necesita de un query builder. */
export interface VisibilityQuery {
  where(group: (query: VisibilityGroup) => void): unknown
}

/**
 * Predicado de las listas: las filas de las empresas propias y las de los
 * aparatos compartidos con ellas. Siempre va en su propio grupo entre
 * parentesis: el `OR` no puede escapar del resto de los filtros aunque el
 * llamador encadene otros `where`, que dentro de `runUnscoped` seria una fuga
 * entre empresas. Devuelve la misma consulta para seguir encadenando. Cada
 * lista decide su alcance de entrada y corta antes si viene vacio.
 */
export function whereVisibleTo<Q extends VisibilityQuery>(
  query: Q,
  ownedScope: number[],
  sharedIds: number[]
): Q {
  query.where((group) => {
    group.whereIn('business_unit_id', ownedScope)
    if (sharedIds.length > 0) group.orWhereIn('access_point_id', sharedIds)
  })
  return query
}
