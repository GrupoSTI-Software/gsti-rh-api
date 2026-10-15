import db from '@adonisjs/lucid/services/db'
import type AccessPoint from '#models/access_point'

/**
 * Lo que el Backoffice pinta de un checador compartido (VLRH-P0065, 6).
 * `sharedRole` es `null` si el aparato no se comparte con nadie.
 */
export interface AccessPointSharingView {
  sharedRole: 'owner' | 'guest' | null
  /** Nombres de las invitadas vivas; solo para la responsable. */
  sharedWith: string[]
  /** Nombre de la responsable; solo para la invitada. */
  sharedBy: string | null
}

const NOT_SHARED: AccessPointSharingView = { sharedRole: null, sharedWith: [], sharedBy: null }

/**
 * Rol y nombres de todos los checadores de una pagina en UNA consulta a
 * `access_point_shares` + `business_units` (sin N+1). Requiere el `businessUnit`
 * precargado en cada aparato: de ahi sale el nombre de la responsable.
 *
 * `viewerBusinessUnitIds` es el alcance de la peticion: un aparato es "owner"
 * si su empresa esta en el alcance; si no, quien lo mira es invitada.
 */
export async function sharingViewOf(
  accessPoints: AccessPoint[],
  viewerBusinessUnitIds: number[]
): Promise<Map<number, AccessPointSharingView>> {
  const result = new Map<number, AccessPointSharingView>()
  if (accessPoints.length === 0) return result

  const rows = (await db
    .from('access_point_shares as s')
    .innerJoin('business_units as b', 'b.business_unit_id', 's.business_unit_id')
    .whereIn(
      's.access_point_id',
      accessPoints.map((row) => row.accessPointId)
    )
    .whereNull('s.access_point_share_revoked_at')
    .orderBy('s.access_point_share_id', 'asc')
    .select('s.access_point_id', 's.business_unit_id', 'b.business_unit_name')) as Array<{
    access_point_id: number
    business_unit_id: number
    business_unit_name: string
  }>

  const guestsByAccessPoint = new Map<number, string[]>()
  for (const row of rows) {
    const names = guestsByAccessPoint.get(Number(row.access_point_id)) ?? []
    names.push(row.business_unit_name)
    guestsByAccessPoint.set(Number(row.access_point_id), names)
  }

  for (const accessPoint of accessPoints) {
    const guests = guestsByAccessPoint.get(accessPoint.accessPointId) ?? []
    const owned = viewerBusinessUnitIds.includes(accessPoint.businessUnitId as number)
    if (owned) {
      result.set(
        accessPoint.accessPointId,
        guests.length > 0 ? { sharedRole: 'owner', sharedWith: guests, sharedBy: null } : NOT_SHARED
      )
    } else {
      result.set(accessPoint.accessPointId, {
        sharedRole: 'guest',
        sharedWith: [],
        sharedBy: accessPoint.businessUnit?.businessUnitName ?? null,
      })
    }
  }
  return result
}
