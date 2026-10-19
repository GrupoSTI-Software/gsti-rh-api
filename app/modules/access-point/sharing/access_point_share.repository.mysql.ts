import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import AccessPointShare from '#models/access_point_share'
import {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
  type AccessPointEmployeeSyncStatus,
} from '#models/access_point_employee'
import { REVOKING_STATUSES } from '#modules/access-point/employee-sync/employee_sync_state'
import type {
  AccessPointShareRepository,
  GuestPivot,
  LiveShareLink,
  ShareAssignment,
  ShareBusinessUnit,
  ShareInsert,
  ShareRecord,
  ShareRevocation,
} from './access_point_share.repository.js'

interface BusinessUnitRow {
  business_unit_id: number
  business_unit_public_id: string
  business_unit_name: string
}

interface LiveLinkRow {
  access_point_share_id: number
  access_point_id: number
  owner_business_unit_id: number
  guest_business_unit_id: number
}

const toBusinessUnit = (row: BusinessUnitRow): ShareBusinessUnit => ({
  businessUnitId: Number(row.business_unit_id),
  businessUnitPublicId: String(row.business_unit_public_id),
  businessUnitName: row.business_unit_name,
})

const toLink = (row: LiveLinkRow): LiveShareLink => ({
  accessPointShareId: Number(row.access_point_share_id),
  accessPointId: Number(row.access_point_id),
  ownerBusinessUnitId: Number(row.owner_business_unit_id),
  guestBusinessUnitId: Number(row.guest_business_unit_id),
})

/** Columnas de una invitacion viva con la responsable de su checador. */
const LIVE_LINK_COLUMNS = [
  's.access_point_share_id',
  's.access_point_id',
  'a.business_unit_id as owner_business_unit_id',
  's.business_unit_id as guest_business_unit_id',
]

/**
 * Invitaciones a checadores en MySQL. Las lecturas cruzan empresas por diseno
 * (es el landlord), asi que van por constructor crudo o por el modelo de
 * invitaciones, que no tiene mixin. Las fechas de la invitacion se leen y
 * escriben por el modelo para no depender de como el driver interpreta la zona.
 */
export default class AccessPointShareRepositoryMysql implements AccessPointShareRepository {
  async findAssignment(platformDeviceAssignmentId: number): Promise<ShareAssignment | null> {
    const assignment = (await db
      .from('platform_device_assignments')
      .where('platform_device_assignment_id', platformDeviceAssignmentId)
      .whereNull('platform_device_assignment_deleted_at')
      .select('platform_device_id', 'business_unit_id', 'platform_device_assignment_released_at')
      .first()) as {
      platform_device_id: number
      business_unit_id: number
      platform_device_assignment_released_at: Date | string | null
    } | null
    if (!assignment) return null

    // Mismo amarre que `ActiveAccessPointService`: unidad + empresa, punto vivo.
    const accessPoint = (await db
      .from('access_points')
      .where('platform_device_id', assignment.platform_device_id)
      .where('business_unit_id', assignment.business_unit_id)
      .whereNull('access_point_deleted_at')
      .orderBy('access_point_id', 'desc')
      .select('access_point_id')
      .first()) as { access_point_id: number } | null

    return {
      platformDeviceAssignmentId,
      ownerBusinessUnitId: Number(assignment.business_unit_id),
      accessPointId: accessPoint ? Number(accessPoint.access_point_id) : null,
      open: assignment.platform_device_assignment_released_at === null,
    }
  }

  async lockOpenAssignment(
    platformDeviceAssignmentId: number,
    trx: TransactionClientContract
  ): Promise<boolean> {
    const row = (await trx
      .from('platform_device_assignments')
      .where('platform_device_assignment_id', platformDeviceAssignmentId)
      .whereNull('platform_device_assignment_deleted_at')
      .select('platform_device_assignment_released_at')
      .forUpdate()
      .first()) as { platform_device_assignment_released_at: Date | string | null } | null
    return row !== null && row.platform_device_assignment_released_at === null
  }

  async findBusinessUnitByPublicId(publicId: string): Promise<ShareBusinessUnit | null> {
    const row = (await db
      .from('business_units')
      .where('business_unit_public_id', publicId)
      .whereNull('business_unit_deleted_at')
      .select('business_unit_id', 'business_unit_public_id', 'business_unit_name')
      .first()) as BusinessUnitRow | null
    return row ? toBusinessUnit(row) : null
  }

  async findBusinessUnits(businessUnitIds: number[]): Promise<ShareBusinessUnit[]> {
    if (businessUnitIds.length === 0) return []
    const rows = (await db
      .from('business_units')
      .whereIn('business_unit_id', businessUnitIds)
      .select('business_unit_id', 'business_unit_public_id', 'business_unit_name')) as BusinessUnitRow[]
    return rows.map(toBusinessUnit)
  }

  async liveGroupIdsOf(businessUnitIds: number[]): Promise<Map<number, number>> {
    const result = new Map<number, number>()
    if (businessUnitIds.length === 0) return result
    const rows = (await db
      .from('platform_tenant_group_members as m')
      .innerJoin(
        'platform_tenant_groups as g',
        'g.platform_tenant_group_id',
        'm.platform_tenant_group_id'
      )
      .whereIn('m.business_unit_id', businessUnitIds)
      .whereNull('g.platform_tenant_group_deleted_at')
      .select('m.business_unit_id', 'm.platform_tenant_group_id')) as Array<{
      business_unit_id: number
      platform_tenant_group_id: number
    }>
    for (const row of rows) {
      result.set(Number(row.business_unit_id), Number(row.platform_tenant_group_id))
    }
    return result
  }

  async listGroupMembers(platformTenantGroupId: number): Promise<ShareBusinessUnit[]> {
    const rows = (await db
      .from('platform_tenant_group_members as m')
      .innerJoin('business_units as b', 'b.business_unit_id', 'm.business_unit_id')
      .where('m.platform_tenant_group_id', platformTenantGroupId)
      .whereNull('b.business_unit_deleted_at')
      .orderBy('b.business_unit_name', 'asc')
      .select(
        'b.business_unit_id',
        'b.business_unit_public_id',
        'b.business_unit_name'
      )) as BusinessUnitRow[]
    return rows.map(toBusinessUnit)
  }

  async isGroupActive(platformTenantGroupId: number): Promise<boolean> {
    const row = await db
      .from('platform_tenant_groups')
      .where('platform_tenant_group_id', platformTenantGroupId)
      .whereNull('platform_tenant_group_deleted_at')
      .where('platform_tenant_group_active', 1)
      .select('platform_tenant_group_id')
      .first()
    return Boolean(row)
  }

  async listByAccessPoint(accessPointId: number): Promise<ShareRecord[]> {
    const shares = await AccessPointShare.query()
      .where('access_point_id', accessPointId)
      .orderBy('access_point_share_id', 'desc')
      .exec()
    return this.withNames(shares)
  }

  async findById(accessPointShareId: number): Promise<ShareRecord | null> {
    const share = await AccessPointShare.query()
      .where('access_point_share_id', accessPointShareId)
      .first()
    if (!share) return null
    const [record] = await this.withNames([share])
    return record
  }

  async hasLive(accessPointId: number, businessUnitId: number): Promise<boolean> {
    const row = await db
      .from('access_point_shares')
      .where('access_point_id', accessPointId)
      .where('business_unit_id', businessUnitId)
      .whereNull('access_point_share_revoked_at')
      .select('access_point_share_id')
      .first()
    return Boolean(row)
  }

  async insert(input: ShareInsert, trx: TransactionClientContract): Promise<number> {
    const share = new AccessPointShare()
    share.useTransaction(trx)
    share.accessPointId = input.accessPointId
    share.businessUnitId = input.businessUnitId
    share.platformTenantGroupId = input.platformTenantGroupId
    share.accessPointShareGrantedAt = input.grantedAt
    share.accessPointShareGrantedBy = input.grantedBy
    await share.save()
    return share.accessPointShareId
  }

  async lockAccessPoint(accessPointId: number, trx: TransactionClientContract): Promise<void> {
    await trx
      .from('access_points')
      .where('access_point_id', accessPointId)
      .select('access_point_id')
      .forUpdate()
      .first()
  }

  async lockLiveByAccessPoint(
    accessPointId: number,
    trx: TransactionClientContract
  ): Promise<LiveShareLink[]> {
    const locked = (await trx
      .from('access_point_shares')
      .where('access_point_id', accessPointId)
      .whereNull('access_point_share_revoked_at')
      .select('access_point_share_id')
      .forUpdate()) as Array<{ access_point_share_id: number }>
    return this.linksOf(
      locked.map((row) => Number(row.access_point_share_id)),
      trx
    )
  }

  async lockLiveById(
    accessPointShareId: number,
    trx: TransactionClientContract
  ): Promise<LiveShareLink | null> {
    const locked = (await trx
      .from('access_point_shares')
      .where('access_point_share_id', accessPointShareId)
      .whereNull('access_point_share_revoked_at')
      .select('access_point_share_id')
      .forUpdate()) as Array<{ access_point_share_id: number }>
    const [link] = await this.linksOf(
      locked.map((row) => Number(row.access_point_share_id)),
      trx
    )
    return link ?? null
  }

  /**
   * Invitaciones con la responsable de su checador, sin bloquear el checador
   * en el join: la fila de `access_points` la bloquea el servicio al abrir la
   * revocacion (`lockAccessPoint`), antes que las invitaciones.
   */
  private async linksOf(
    accessPointShareIds: number[],
    trx: TransactionClientContract
  ): Promise<LiveShareLink[]> {
    if (accessPointShareIds.length === 0) return []
    const rows = (await trx
      .from('access_point_shares as s')
      .innerJoin('access_points as a', 'a.access_point_id', 's.access_point_id')
      .whereIn('s.access_point_share_id', accessPointShareIds)
      .orderBy('s.access_point_share_id', 'asc')
      .select(LIVE_LINK_COLUMNS)) as LiveLinkRow[]
    return rows.map(toLink)
  }

  async markRevoked(
    accessPointShareIds: number[],
    revocation: ShareRevocation,
    trx: TransactionClientContract
  ): Promise<void> {
    if (accessPointShareIds.length === 0) return
    const shares = await AccessPointShare.query({ client: trx })
      .whereIn('access_point_share_id', accessPointShareIds)
      .whereNull('access_point_share_revoked_at')
      .exec()
    for (const share of shares) {
      share.accessPointShareRevokedAt = revocation.revokedAt
      share.accessPointShareRevokedBy = revocation.revokedBy
      share.accessPointShareRevokeReason = revocation.reason
      await share.save()
    }
  }

  /**
   * Vinculos vivos de la invitada sin baja pedida, incluidos los `pending_pin`
   * que nunca llegaron al aparato (se desprenden sin encolar). Los que ya van
   * de salida no se tocan.
   */
  async listLiveGuestPivots(
    accessPointId: number,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<GuestPivot[]> {
    const rows = (await trx
      .from('access_point_employees')
      .where('access_point_id', accessPointId)
      .where('business_unit_id', businessUnitId)
      .whereNull('access_point_employee_deleted_at')
      .whereNotIn('access_point_employee_sync_status', [
        ...REVOKING_STATUSES,
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
      ])
      .orderBy('access_point_employee_id', 'asc')
      .select('employee_id', 'business_unit_id', 'access_point_employee_sync_status')) as Array<{
      employee_id: number
      business_unit_id: number
      access_point_employee_sync_status: AccessPointEmployeeSyncStatus
    }>
    return rows.map((row) => ({
      employeeId: Number(row.employee_id),
      businessUnitId: Number(row.business_unit_id),
      syncStatus: row.access_point_employee_sync_status,
    }))
  }

  async listLiveInvolving(businessUnitIds: number[]): Promise<LiveShareLink[]> {
    if (businessUnitIds.length === 0) return []
    const rows = (await db
      .from('access_point_shares as s')
      .innerJoin('access_points as a', 'a.access_point_id', 's.access_point_id')
      .whereNull('s.access_point_share_revoked_at')
      .whereNull('a.access_point_deleted_at')
      .where((query) => {
        query
          .whereIn('s.business_unit_id', businessUnitIds)
          .orWhereIn('a.business_unit_id', businessUnitIds)
      })
      .orderBy('s.access_point_share_id', 'asc')
      .select(LIVE_LINK_COLUMNS)) as LiveLinkRow[]
    return rows.map(toLink)
  }

  private async withNames(shares: AccessPointShare[]): Promise<ShareRecord[]> {
    const units = await this.findBusinessUnits([...new Set(shares.map((s) => s.businessUnitId))])
    const byId = new Map(units.map((unit) => [unit.businessUnitId, unit]))
    return shares.map((share) => {
      const unit = byId.get(share.businessUnitId)
      return {
        accessPointShareId: share.accessPointShareId,
        accessPointId: share.accessPointId,
        businessUnitId: share.businessUnitId,
        businessUnitPublicId: unit?.businessUnitPublicId ?? '',
        businessUnitName: unit?.businessUnitName ?? '',
        grantedAt: share.accessPointShareGrantedAt,
        revokedAt: share.accessPointShareRevokedAt,
        revokeReason: share.accessPointShareRevokeReason,
      }
    })
  }
}
