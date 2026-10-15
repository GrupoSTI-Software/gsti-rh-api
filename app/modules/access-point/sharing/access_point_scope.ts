import db from '@adonisjs/lucid/services/db'
import { ACCESS_POINT_EMPLOYEE_SYNC_STATUS } from '#models/access_point_employee'
import { DEVICE_COMMAND_STATUS } from '#modules/device-commands/device_command.constants'

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

  /**
   * Scope del canal ADMS de un checador (VLRH-P0065, 3.3 y 4).
   *
   * Mas amplio que `participants`: una invitada revocada deja de operar en el
   * Backoffice, pero el aparato todavia guarda a su personal hasta confirmar
   * la baja. Mientras tenga pivotes no revocados o comandos vivos en el
   * aparato, el canal la sigue viendo: si no, la cola nunca despacha su
   * `user_delete`, el acuse no encuentra su comando y la conciliacion deja sus
   * pivotes en baja para siempre. La autorizacion del Backoffice sigue usando
   * `participants`.
   */
  async channelParticipants(accessPointId: number, ownerBusinessUnitId: number): Promise<number[]> {
    const live = await AccessPointScope.participants(accessPointId, ownerBusinessUnitId)
    const pivotRows = (await db
      .from('access_point_employees')
      .where('access_point_id', accessPointId)
      .whereNull('access_point_employee_deleted_at')
      .whereNot('access_point_employee_sync_status', ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
      .distinct('business_unit_id')) as Array<{ business_unit_id: number }>
    const commandRows = (await db
      .from('device_commands')
      .where('access_point_id', accessPointId)
      .whereIn('device_command_status', [DEVICE_COMMAND_STATUS.PENDING, DEVICE_COMMAND_STATUS.SENT])
      .distinct('business_unit_id')) as Array<{ business_unit_id: number }>
    const lingering = [...pivotRows, ...commandRows]
      .map((row) => Number(row.business_unit_id))
      .filter((id) => !live.includes(id))
      .sort((a, b) => a - b)
    return [...live, ...new Set(lingering)]
  },

  /**
   * El aparato tiene o tuvo invitadas. Basta una fila de invitacion, viva o
   * revocada: el personal de una ex-invitada puede seguir en el aparato y su
   * codigo de colaborador no identifica dentro de la responsable (D7).
   */
  async everShared(accessPointId: number): Promise<boolean> {
    const row = await db
      .from('access_point_shares')
      .where('access_point_id', accessPointId)
      .select('access_point_share_id')
      .first()
    return Boolean(row)
  },

  /**
   * Empresa responsable del aparato, o `null` si no existe o esta borrado.
   * Los comandos del aparato (`CHECK`) van a su nombre (3.3): a nombre de una
   * ex-invitada, el guard de la cola los rechaza.
   */
  async ownerOf(accessPointId: number): Promise<number | null> {
    const row = (await db
      .from('access_points')
      .where('access_point_id', accessPointId)
      .whereNull('access_point_deleted_at')
      .select('business_unit_id')
      .first()) as { business_unit_id: number } | null
    return row ? Number(row.business_unit_id) : null
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

  /**
   * Scope de las operaciones centradas en un colaborador (su ficha de
   * biometricos): su empresa, las responsables de los checadores compartidos
   * con ella y las de aparatos donde su personal tiene vinculos no revocados. Sin esto, el perfil y la cola de un aparato ajeno quedan fuera
   * del mixin y la operacion lo salta en silencio (p. ej. retirar el rostro).
   */
  async forEmployee(businessUnitId: number): Promise<number[]> {
    const rows = (await db
      .from('access_point_shares as s')
      .innerJoin('access_points as a', 'a.access_point_id', 's.access_point_id')
      .where('s.business_unit_id', businessUnitId)
      .whereNull('s.access_point_share_revoked_at')
      .whereNull('a.access_point_deleted_at')
      .distinct('a.business_unit_id')) as Array<{ business_unit_id: number }>
    /**
     * Y las responsables de aparatos donde su personal sigue dado de alta
     * aunque la invitacion ya se revoco: hasta que el aparato confirme la
     * baja, la ex-invitada tiene que ver esos vinculos y poder forzar su
     * cierre (VLRH-P0065, 3.3).
     */
    const lingering = (await db
      .from('access_point_employees as p')
      .innerJoin('access_points as a', 'a.access_point_id', 'p.access_point_id')
      .where('p.business_unit_id', businessUnitId)
      .whereNull('p.access_point_employee_deleted_at')
      .whereNot('p.access_point_employee_sync_status', ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
      .whereNull('a.access_point_deleted_at')
      .distinct('a.business_unit_id')) as Array<{ business_unit_id: number }>
    const owners = [...rows, ...lingering]
      .map((row) => Number(row.business_unit_id))
      .filter((id) => id !== businessUnitId)
    return [businessUnitId, ...new Set(owners)]
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
