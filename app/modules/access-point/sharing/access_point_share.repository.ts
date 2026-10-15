import type { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { AccessPointShareRevokeReason } from '#models/access_point_share'
import type { AccessPointEmployeeSyncStatus } from '#models/access_point_employee'

/** Entrega de una unidad y el checador que le corresponde a la responsable. */
export interface ShareAssignment {
  platformDeviceAssignmentId: number
  ownerBusinessUnitId: number
  /** `null` si la empresa borro el punto de acceso de la unidad. */
  accessPointId: number | null
  open: boolean
}

export interface ShareBusinessUnit {
  businessUnitId: number
  businessUnitPublicId: string
  businessUnitName: string
}

/** Invitacion con el nombre de la empresa invitada. */
export interface ShareRecord {
  accessPointShareId: number
  accessPointId: number
  businessUnitId: number
  businessUnitPublicId: string
  businessUnitName: string
  grantedAt: DateTime
  revokedAt: DateTime | null
  revokeReason: AccessPointShareRevokeReason | null
}

/** Invitacion viva con la responsable de su checador. */
export interface LiveShareLink {
  accessPointShareId: number
  accessPointId: number
  ownerBusinessUnitId: number
  guestBusinessUnitId: number
}

/** Vinculo vivo de un colaborador de la invitada con el checador. */
export interface GuestPivot {
  employeeId: number
  businessUnitId: number
  syncStatus: AccessPointEmployeeSyncStatus
}

export interface ShareInsert {
  accessPointId: number
  businessUnitId: number
  platformTenantGroupId: number
  grantedAt: DateTime
  grantedBy: number | null
}

export interface ShareRevocation {
  revokedAt: DateTime
  revokedBy: number | null
  reason: AccessPointShareRevokeReason
}

/**
 * Persistencia de las invitaciones a checadores (VLRH-P0065, 3.1). Dato de
 * plataforma: todo se lee sin mixin de empresa.
 */
export interface AccessPointShareRepository {
  findAssignment(platformDeviceAssignmentId: number): Promise<ShareAssignment | null>
  findBusinessUnitByPublicId(publicId: string): Promise<ShareBusinessUnit | null>
  findBusinessUnits(businessUnitIds: number[]): Promise<ShareBusinessUnit[]>
  /** Grupo vivo de cada empresa que tenga uno (una empresa esta en un solo grupo). */
  liveGroupIdsOf(businessUnitIds: number[]): Promise<Map<number, number>>
  listGroupMembers(platformTenantGroupId: number): Promise<ShareBusinessUnit[]>
  /** Un grupo apagado conserva miembros pero no admite invitaciones nuevas. */
  isGroupActive(platformTenantGroupId: number): Promise<boolean>
  listByAccessPoint(accessPointId: number): Promise<ShareRecord[]>
  findById(accessPointShareId: number): Promise<ShareRecord | null>
  hasLive(accessPointId: number, businessUnitId: number): Promise<boolean>
  insert(input: ShareInsert, trx: TransactionClientContract): Promise<number>
  /** Invitaciones vivas del checador, bloqueadas hasta el fin de la transaccion. */
  lockLiveByAccessPoint(accessPointId: number, trx: TransactionClientContract): Promise<LiveShareLink[]>
  /** La invitacion si sigue viva, bloqueada hasta el fin de la transaccion. */
  lockLiveById(accessPointShareId: number, trx: TransactionClientContract): Promise<LiveShareLink | null>
  markRevoked(
    accessPointShareIds: number[],
    revocation: ShareRevocation,
    trx: TransactionClientContract
  ): Promise<void>
  /** Vinculos de la invitada sin baja pedida, leidos en la transaccion dada. */
  listLiveGuestPivots(
    accessPointId: number,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<GuestPivot[]>
  listLiveInvolving(businessUnitIds: number[]): Promise<LiveShareLink[]>
}
