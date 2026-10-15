import db from '@adonisjs/lucid/services/db'

/**
 * Scope de un checador: la responsable y sus invitadas vivas (VLRH-P0065, 3.4).
 *
 * Punto unico de verdad. Lo usan el canal, el guard de comandos, la
 * autorizacion del Backoffice y la replicacion. Se lee por query builder, sin
 * modelo, igual que `access_point_lookup.ts`: corre antes de que exista
 * contexto de tenant y no debe depender del mixin.
 */
export const AccessPointScope = {
  async participants(accessPointId: number, ownerBusinessUnitId: number): Promise<number[]> {
    const rows = (await db
      .from('access_point_shares')
      .where('access_point_id', accessPointId)
      .whereNull('access_point_share_revoked_at')
      .orderBy('access_point_share_id', 'asc')
      .select('business_unit_id')) as Array<{ business_unit_id: number }>
    const guests = rows
      .map((row) => Number(row.business_unit_id))
      .filter((id) => id !== ownerBusinessUnitId)
    return [ownerBusinessUnitId, ...new Set(guests)]
  },

  async isParticipant(accessPointId: number, businessUnitId: number): Promise<boolean> {
    const owner = await db
      .from('access_points')
      .where('access_point_id', accessPointId)
      .whereNull('access_point_deleted_at')
      .select('business_unit_id')
      .first()
    if (!owner) return false
    if (Number(owner.business_unit_id) === businessUnitId) return true
    const share = await db
      .from('access_point_shares')
      .where('access_point_id', accessPointId)
      .where('business_unit_id', businessUnitId)
      .whereNull('access_point_share_revoked_at')
      .first()
    return Boolean(share)
  },

  async sharedWith(businessUnitId: number): Promise<number[]> {
    const rows = (await db
      .from('access_point_shares')
      .where('business_unit_id', businessUnitId)
      .whereNull('access_point_share_revoked_at')
      .select('access_point_id')) as Array<{ access_point_id: number }>
    return rows.map((row) => Number(row.access_point_id))
  },
}
