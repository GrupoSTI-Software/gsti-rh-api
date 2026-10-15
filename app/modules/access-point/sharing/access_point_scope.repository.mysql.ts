import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import { ACCESS_POINT_EMPLOYEE_SYNC_STATUS } from '#models/access_point_employee'
import { DEVICE_COMMAND_STATUS } from '#modules/device-commands/device_command.constants'
import AccessPoint from '#models/access_point'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import type {
  AccessPointRoleScope,
  AccessPointScopePort,
  AccessPointVisibility,
  ChannelScope,
  VisibilityOptions,
} from './access_point_scope.port.js'

/** Fila de la consulta unica del scope del canal. */
interface ChannelScopeRow {
  src: 'ever' | 'live' | 'lingering'
  business_unit_id: number | null
  ord: number
  ever_shared: number
}

/**
 * Adaptador MySQL del scope de un checador (VLRH-P0065, 3.4).
 *
 * Se lee por query builder, sin modelo, igual que `access_point_lookup.ts`:
 * corre antes de que exista contexto de tenant y no debe depender del mixin.
 * La unica lectura por modelo (`visibleTo`) corre bajo bypass declarado y se
 * cierra dentro de el.
 */
export default class AccessPointScopeRepositoryMysql implements AccessPointScopePort {
  /**
   * La responsable primero y las invitadas vivas por antiguedad de la
   * invitacion, sin duplicados. Es el scope del Backoffice.
   */
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
  }

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
    const scope = await this.channelScope(accessPointId, ownerBusinessUnitId)
    return scope.participantBusinessUnitIds
  }

  /**
   * El scope del canal (`channelParticipants`) y si el aparato tiene o tuvo
   * invitadas, en UNA consulta: corre en cada peticion del aparato, incluido
   * cada `getrequest`. Cada rama filtra por `access_point_id`, que es el
   * primer campo de un indice en las tres tablas.
   *
   * `everShared`: basta una fila de invitacion, viva o revocada; el personal
   * de una ex-invitada puede seguir en el aparato y su codigo de colaborador
   * no identifica dentro de la responsable (D7).
   *
   * `participantBusinessUnitIds`: la responsable primero, luego las invitadas
   * vivas por antiguedad de la invitacion y al final, ascendentes, las
   * empresas con vinculos no revocados o comandos vivos. Sin duplicados.
   */
  async channelScope(
    accessPointId: number,
    ownerBusinessUnitId: number,
    client?: QueryClientContract
  ): Promise<ChannelScope> {
    const result = (await (client ?? db).rawQuery(
      `SELECT 'ever' AS src, NULL AS business_unit_id, 0 AS ord,
              EXISTS(SELECT 1 FROM access_point_shares WHERE access_point_id = ?) AS ever_shared
       UNION ALL
       SELECT 'live', s.business_unit_id, s.access_point_share_id, 0
         FROM access_point_shares s
        WHERE s.access_point_id = ? AND s.access_point_share_revoked_at IS NULL
       UNION ALL
       SELECT DISTINCT 'lingering', p.business_unit_id, 0, 0
         FROM access_point_employees p
        WHERE p.access_point_id = ?
          AND p.access_point_employee_deleted_at IS NULL
          AND p.access_point_employee_sync_status <> ?
       UNION ALL
       SELECT DISTINCT 'lingering', c.business_unit_id, 0, 0
         FROM device_commands c
        WHERE c.access_point_id = ? AND c.device_command_status IN (?, ?)`,
      [
        accessPointId,
        accessPointId,
        accessPointId,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
        accessPointId,
        DEVICE_COMMAND_STATUS.PENDING,
        DEVICE_COMMAND_STATUS.SENT,
      ]
    )) as [ChannelScopeRow[], unknown]
    const rows = result[0]

    const live = rows
      .filter((row) => row.src === 'live')
      .sort((a, b) => Number(a.ord) - Number(b.ord))
      .map((row) => Number(row.business_unit_id))
      .filter((id) => id !== ownerBusinessUnitId)
    const participants = [ownerBusinessUnitId, ...new Set(live)]
    const lingering = rows
      .filter((row) => row.src === 'lingering')
      .map((row) => Number(row.business_unit_id))
      .filter((id) => !participants.includes(id))
      .sort((a, b) => a - b)
    return {
      participantBusinessUnitIds: [...participants, ...new Set(lingering)],
      everShared: rows.some((row) => row.src === 'ever' && Number(row.ever_shared) === 1),
    }
  }

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
  }

  /**
   * La empresa es la responsable del aparato vivo o tiene invitacion viva.
   *
   * Sin `client` lee con una conexion del pool, en lectura consistente: no
   * espera candados de otra transaccion. Dentro de la transaccion del aparato
   * (`inDeviceTransaction`, `enqueueIdempotent` con `outerTrx`) se pasa esa
   * `trx`: la operacion no pide otra conexion mientras retiene la suya, y como
   * la lectura ocurre despues del `FOR UPDATE`, ve lo que confirmo quien tenia
   * el candado antes.
   */
  async isParticipant(
    accessPointId: number,
    businessUnitId: number,
    client?: QueryClientContract
  ): Promise<boolean> {
    const owner = await (client ?? db)
      .from('access_points')
      .where('access_point_id', accessPointId)
      .whereNull('access_point_deleted_at')
      .select('business_unit_id')
      .first()
    if (!owner) return false
    if (Number(owner.business_unit_id) === businessUnitId) return true
    const share = await (client ?? db)
      .from('access_point_shares')
      .where('access_point_id', accessPointId)
      .where('business_unit_id', businessUnitId)
      .whereNull('access_point_share_revoked_at')
      .first()
    return Boolean(share)
  }

  /**
   * Scope de las operaciones centradas en un colaborador (su ficha de
   * biometricos): su empresa, las responsables de los checadores compartidos
   * con ella y las de aparatos donde su personal tiene vinculos no revocados.
   * Sin esto, el perfil y la cola de un aparato ajeno quedan fuera del mixin y
   * la operacion lo salta en silencio (p. ej. retirar el rostro).
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
  }

  /** Checadores ajenos con invitacion viva para la empresa (sin orden). */
  async sharedWith(businessUnitId: number): Promise<number[]> {
    const rows = (await db
      .from('access_point_shares')
      .where('business_unit_id', businessUnitId)
      .whereNull('access_point_share_revoked_at')
      .select('access_point_id')) as Array<{ access_point_id: number }>
    return rows.map((row) => Number(row.access_point_id))
  }

  async visibleTo(
    accessPointId: number,
    requestScope: number[],
    options: VisibilityOptions = {}
  ): Promise<AccessPointVisibility | null> {
    if (requestScope.length === 0) return null
    // La responsable de un compartido no esta en el alcance: se lee sin el
    // mixin y la consulta se cierra con `first()` dentro del bypass (VLRH-A0036, M12).
    const accessPoint = await TenantContext.runUnscoped(
      () =>
        AccessPoint.query()
          .where('access_point_id', accessPointId)
          .whereNull('access_point_deleted_at')
          .first(),
      TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING
    )
    if (!accessPoint) return null
    const seen = await this.roleOf(accessPoint, requestScope, options)
    return seen ? { accessPoint, ...seen } : null
  }

  async roleOf(
    accessPoint: { accessPointId: number; businessUnitId: number },
    requestScope: number[],
    options: VisibilityOptions = {}
  ): Promise<AccessPointRoleScope | null> {
    if (requestScope.length === 0) return null
    const deviceScope = options.includeLingering
      ? await this.channelParticipants(accessPoint.accessPointId, accessPoint.businessUnitId)
      : await this.participants(accessPoint.accessPointId, accessPoint.businessUnitId)
    const owner = requestScope.includes(accessPoint.businessUnitId)
    const guest = !owner && deviceScope.some((id) => requestScope.includes(id))
    if (!owner && !guest) return null
    return { role: owner ? 'owner' : 'guest', deviceScope }
  }
}
