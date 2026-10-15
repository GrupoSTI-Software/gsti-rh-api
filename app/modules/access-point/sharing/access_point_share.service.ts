import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  ACCESS_POINT_SHARE_REVOKE_REASON,
  type AccessPointShareRevokeReason,
} from '#models/access_point_share'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import EmployeeSyncService from '#modules/access-point/employee-sync/employee_sync.service'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import type { DeviceCommandPort } from '#modules/device-commands/device_command_port'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import { canDetachAssignment } from '#modules/access-point/employee-sync/employee_sync_state'
import { AccessPointScope } from './access_point_scope.js'
import { AccessPointShareErrors } from './access_point_share.errors.js'
import AccessPointShareRepositoryMysql from './access_point_share.repository.mysql.js'
import type {
  AccessPointShareRepository,
  ShareAssignment,
  ShareRecord,
} from './access_point_share.repository.js'

export interface AccessPointShareItem {
  accessPointShareId: number
  businessUnitPublicId: string
  businessUnitName: string
  grantedAt: string
  revokedAt: string | null
  revokeReason: AccessPointShareRevokeReason | null
  /** Invitacion viva cuya invitada ya no comparte grupo vivo con la responsable (D5). */
  outsideGroup: boolean
}

export interface AccessPointShareCandidate {
  businessUnitPublicId: string
  businessUnitName: string
}

export interface AccessPointShareList {
  items: AccessPointShareItem[]
  candidates: AccessPointShareCandidate[]
}

/** Aviso al sacar empresas de un grupo con invitaciones vivas (VLRH-P0065, 5 y D5). */
export interface ShareGroupWarning {
  businessUnitPublicId: string
  businessUnitName: string
  accessPointIds: number[]
  key: 'invitacion-fuera-del-grupo'
}

const REASON = TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING

/** Error de MySQL al chocar con el indice unico de invitaciones vivas. */
function isDuplicateEntry(error: unknown): boolean {
  const err = error as { code?: string; errno?: number } | null
  return err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062
}

/**
 * El landlord otorga y revoca invitaciones a un checador (VLRH-P0065, D3 y 5).
 *
 * Revocar da de baja en el aparato al personal de la invitada; los templates
 * de la boveda no se tocan porque son de la empresa del colaborador (3.2.4).
 * Sacar una empresa del grupo no revoca nada: solo avisa (D5).
 */
export default class AccessPointShareService {
  constructor(
    private readonly repository: AccessPointShareRepository = new AccessPointShareRepositoryMysql(),
    private readonly sync: EmployeeSyncService = new EmployeeSyncService(),
    private readonly commands: DeviceCommandPort = new DeviceCommandService()
  ) {}

  /**
   * Historial de invitaciones del checador de la entrega y las empresas del
   * grupo a las que todavia se puede invitar (solo con la entrega abierta).
   *
   * @throws PlatformDeviceServiceError 409 `unidad-sin-asignacion`
   */
  async list(platformDeviceAssignmentId: number): Promise<AccessPointShareList> {
    return TenantContext.runUnscoped(async () => {
      const assignment = await this.repository.findAssignment(platformDeviceAssignmentId)
      if (!assignment || assignment.accessPointId === null) {
        throw AccessPointShareErrors.noAssignment()
      }
      const records = await this.repository.listByAccessPoint(assignment.accessPointId)
      const liveGuests = records.filter((r) => r.revokedAt === null).map((r) => r.businessUnitId)
      const groups = await this.repository.liveGroupIdsOf([
        assignment.ownerBusinessUnitId,
        ...liveGuests,
      ])
      const ownerGroup = groups.get(assignment.ownerBusinessUnitId)
      const items = records.map((record) =>
        this.toItem(
          record,
          record.revokedAt === null &&
            (ownerGroup === undefined || groups.get(record.businessUnitId) !== ownerGroup)
        )
      )

      let candidates: AccessPointShareCandidate[] = []
      if (assignment.open && ownerGroup !== undefined) {
        const taken = new Set([assignment.ownerBusinessUnitId, ...liveGuests])
        const members = await this.repository.listGroupMembers(ownerGroup)
        candidates = members
          .filter((member) => !taken.has(member.businessUnitId))
          .map((member) => ({
            businessUnitPublicId: member.businessUnitPublicId,
            businessUnitName: member.businessUnitName,
          }))
      }
      return { items, candidates }
    }, REASON)
  }

  /**
   * Invita a una empresa del grupo al checador de la entrega (VLRH-P0065, 3.2.2).
   *
   * @throws PlatformDeviceServiceError 409 `unidad-sin-asignacion` — entrega cerrada o sin punto de acceso.
   * @throws PlatformDeviceServiceError 409 `invitacion-duplicada` — es la responsable o ya tiene invitacion viva.
   * @throws PlatformDeviceServiceError 422 `empresa-fuera-del-grupo` — no comparte grupo vivo con la responsable.
   */
  async grant(input: {
    platformDeviceAssignmentId: number
    businessUnitPublicId: string
    userId: number
  }): Promise<AccessPointShareItem> {
    return TenantContext.runUnscoped(async () => {
      const assignment = await this.requireOpenAssignment(input.platformDeviceAssignmentId)
      const accessPointId = assignment.accessPointId as number

      // Una empresa inexistente tampoco esta en el grupo: mismo error, sin revelar nada mas.
      const guest = await this.repository.findBusinessUnitByPublicId(input.businessUnitPublicId)
      if (!guest) throw AccessPointShareErrors.outsideGroup()
      if (
        guest.businessUnitId === assignment.ownerBusinessUnitId ||
        (await this.repository.hasLive(accessPointId, guest.businessUnitId))
      ) {
        throw AccessPointShareErrors.duplicate()
      }

      const groups = await this.repository.liveGroupIdsOf([
        assignment.ownerBusinessUnitId,
        guest.businessUnitId,
      ])
      const groupId = groups.get(assignment.ownerBusinessUnitId)
      if (groupId === undefined || groups.get(guest.businessUnitId) !== groupId) {
        throw AccessPointShareErrors.outsideGroup()
      }
      // Un grupo apagado no certifica la relacion: no admite invitaciones nuevas.
      if (!(await this.repository.isGroupActive(groupId))) {
        throw AccessPointShareErrors.outsideGroup()
      }

      let shareId: number
      try {
        shareId = await db.transaction((trx) =>
          this.repository.insert(
            {
              accessPointId,
              businessUnitId: guest.businessUnitId,
              platformTenantGroupId: groupId,
              grantedAt: DateTime.utc(),
              grantedBy: input.userId,
            },
            trx
          )
        )
      } catch (error) {
        // Dos otorgamientos simultaneos: el indice unico de invitaciones vivas manda.
        if (isDuplicateEntry(error)) throw AccessPointShareErrors.duplicate()
        throw error
      }
      return this.toItem(await this.requireShare(shareId), false)
    }, REASON)
  }

  /**
   * Revoca una invitacion del checador de la entrega y da de baja en el
   * aparato a todo el personal vivo de la invitada (VLRH-P0065, 3.2.4).
   * Revocar una invitacion ya revocada no hace nada y la devuelve igual.
   *
   * @throws PlatformDeviceServiceError 409 `unidad-sin-asignacion` — la entrega no existe.
   * @throws PlatformDeviceServiceError 404 `invitacion-no-encontrada` — no es de ese checador.
   */
  async revoke(input: {
    platformDeviceAssignmentId: number
    accessPointShareId: number
    userId: number
  }): Promise<AccessPointShareItem> {
    return TenantContext.runUnscoped(async () => {
      const assignment = await this.repository.findAssignment(input.platformDeviceAssignmentId)
      if (!assignment) throw AccessPointShareErrors.noAssignment()
      const share = await this.repository.findById(input.accessPointShareId)
      if (!share || share.accessPointId !== assignment.accessPointId) {
        throw AccessPointShareErrors.notFound()
      }

      if (share.revokedAt === null) {
        await db.transaction(async (trx) => {
          // El aparato primero: el mismo orden de candados que el envio del alta.
          await this.repository.lockAccessPoint(share.accessPointId, trx)
          const link = await this.repository.lockLiveById(share.accessPointShareId, trx)
          if (!link) return // otra peticion la revoco primero
          await this.retireGuestStaff(
            link.accessPointId,
            link.ownerBusinessUnitId,
            link.guestBusinessUnitId,
            input.userId,
            trx
          )
          await this.repository.markRevoked(
            [link.accessPointShareId],
            {
              revokedAt: DateTime.utc(),
              revokedBy: input.userId,
              reason: ACCESS_POINT_SHARE_REVOKE_REASON.MANUAL,
            },
            trx
          )
        })
      }
      return this.toItem(await this.requireShare(share.accessPointShareId), false)
    }, REASON)
  }

  /**
   * Cierra todas las invitaciones vivas del checador al desasignar la unidad
   * (VLRH-P0065, 3.2.3), dentro de la transaccion de la desasignacion.
   *
   * @returns Cuantas invitaciones cerro.
   */
  async revokeAllForAccessPoint(
    accessPointId: number,
    userId: number | null,
    trx: TransactionClientContract
  ): Promise<number> {
    return TenantContext.runUnscoped(async () => {
      // El aparato primero: el mismo orden de candados que el envio del alta.
      await this.repository.lockAccessPoint(accessPointId, trx)
      const links = await this.repository.lockLiveByAccessPoint(accessPointId, trx)
      if (links.length === 0) return 0
      for (const link of links) {
        await this.retireGuestStaff(
          link.accessPointId,
          link.ownerBusinessUnitId,
          link.guestBusinessUnitId,
          userId,
          trx
        )
      }
      await this.repository.markRevoked(
        links.map((link) => link.accessPointShareId),
        {
          revokedAt: DateTime.utc(),
          revokedBy: userId,
          reason: ACCESS_POINT_SHARE_REVOKE_REASON.UNASSIGNMENT,
        },
        trx
      )
      return links.length
    }, REASON)
  }

  /**
   * Invitaciones vivas que tocan a las empresas dadas y que ya no comparten
   * grupo vivo con su contraparte. Se llama DESPUES de mover las membresias:
   * asi una empresa que sale y entra a otro grupo junto con su contraparte no
   * genera aviso. No revoca nada (D5).
   */
  async warningsForGroupExit(businessUnitIds: number[]): Promise<ShareGroupWarning[]> {
    if (businessUnitIds.length === 0) return []
    return TenantContext.runUnscoped(async () => {
      const links = await this.repository.listLiveInvolving(businessUnitIds)
      if (links.length === 0) return []
      const groups = await this.repository.liveGroupIdsOf([
        ...new Set(links.flatMap((l) => [l.ownerBusinessUnitId, l.guestBusinessUnitId])),
      ])
      const affected = new Set(businessUnitIds)
      const byUnit = new Map<number, Set<number>>()
      for (const link of links) {
        const ownerGroup = groups.get(link.ownerBusinessUnitId)
        const together =
          ownerGroup !== undefined && groups.get(link.guestBusinessUnitId) === ownerGroup
        if (together) continue
        for (const unitId of [link.ownerBusinessUnitId, link.guestBusinessUnitId]) {
          if (!affected.has(unitId)) continue
          const accessPoints = byUnit.get(unitId) ?? new Set<number>()
          accessPoints.add(link.accessPointId)
          byUnit.set(unitId, accessPoints)
        }
      }
      if (byUnit.size === 0) return []
      const units = await this.repository.findBusinessUnits([...byUnit.keys()])
      return units.map((unit) => ({
        businessUnitPublicId: unit.businessUnitPublicId,
        businessUnitName: unit.businessUnitName,
        accessPointIds: [...(byUnit.get(unit.businessUnitId) ?? [])].sort((a, b) => a - b),
        key: 'invitacion-fuera-del-grupo' as const,
      }))
    }, REASON)
  }

  /**
   * Baja en el aparato de cada colaborador vivo de la invitada.
   *
   * El llamador ya tiene bloqueado el aparato (`lockAccessPoint`): un envio
   * de la invitada que llegue despues espera el candado y, ya revocada, el
   * guard de la cola lo rechaza; uno que llego antes ya dejo su alta en cola
   * y aqui se cancela.
   *
   * Todo va en la transaccion del llamador (`trx`): pivotes, cancelaciones,
   * bajas y eventos se revierten con ella. Asi, si la desasignacion falla
   * despues (p. ej. al apagar el punto de acceso), no queda ningun
   * `user_delete` en cola ni pivotes en `revoking` (RN5 del spec 1883).
   *
   * Corre con el scope del checador ANTES de revocar: la invitada sigue siendo
   * participante, asi que el guard de comandos acepta la baja a su nombre y el
   * mixin deja ver sus vinculos y su cola. La marca de la invitacion la pone
   * quien llama despues, en la misma transaccion.
   *
   * - Un comando pendiente de la invitada sin amarre al vinculo (alta, copia
   *   de biometria, foto) no lo cierra `revoke` (cancela por vinculo); se
   *   cancela aqui antes de pedir la baja, o el aparato lo recogeria despues
   *   y la persona o su dato quedarian dentro.
   * - Un `pending_pin` nunca llego al aparato: se desprende con su evento, sin
   *   encolar nada.
   */
  private async retireGuestStaff(
    accessPointId: number,
    ownerBusinessUnitId: number,
    guestBusinessUnitId: number,
    userId: number | null,
    trx: TransactionClientContract
  ): Promise<void> {
    const pivots = await this.repository.listLiveGuestPivots(
      accessPointId,
      guestBusinessUnitId,
      trx
    )
    if (pivots.length === 0) return
    const participants = await AccessPointScope.participants(accessPointId, ownerBusinessUnitId)
    await TenantContext.run(participants, async () => {
      const pending = await this.commands.listByDevice(
        accessPointId,
        DEVICE_COMMAND_STATUS.PENDING,
        trx
      )
      for (const pivot of pivots) {
        const target = {
          accessPointId,
          businessUnitId: pivot.businessUnitId,
          employeeId: pivot.employeeId,
          actor: { userId },
        }
        if (canDetachAssignment(pivot.syncStatus)) {
          await this.sync.detachUnsent(
            { ...target, detail: 'Invitacion al checador revocada: vinculo sin PIN retirado' },
            trx
          )
          continue
        }
        /**
         * Todo lo que siga en cola para esa persona en el aparato (alta, copias
         * de biometria, fotos) se cancela: despues de la baja, cualquiera de
         * esos comandos la volveria a meter o dejaria un dato suyo dentro.
         * Una baja ya en cola no se toca: es justo lo que se quiere.
         */
        const orphans = pending.filter(
          (command) =>
            command.deviceCommandKind !== DEVICE_COMMAND_KIND.USER_DELETE &&
            command.employeeId === pivot.employeeId
        )
        for (const command of orphans) {
          await this.commands.cancel(command.deviceCommandId, userId, trx)
        }
        await this.sync.revoke(target, trx)
      }
    })
  }

  private async requireOpenAssignment(platformDeviceAssignmentId: number): Promise<ShareAssignment> {
    const assignment = await this.repository.findAssignment(platformDeviceAssignmentId)
    if (!assignment || !assignment.open || assignment.accessPointId === null) {
      throw AccessPointShareErrors.noAssignment()
    }
    return assignment
  }

  private async requireShare(accessPointShareId: number): Promise<ShareRecord> {
    const share = await this.repository.findById(accessPointShareId)
    if (!share) throw AccessPointShareErrors.notFound()
    return share
  }

  private toItem(record: ShareRecord, outsideGroup: boolean): AccessPointShareItem {
    return {
      accessPointShareId: record.accessPointShareId,
      businessUnitPublicId: record.businessUnitPublicId,
      businessUnitName: record.businessUnitName,
      grantedAt: record.grantedAt.toUTC().toISO() as string,
      revokedAt: record.revokedAt ? (record.revokedAt.toUTC().toISO() as string) : null,
      revokeReason: record.revokeReason,
      outsideGroup,
    }
  }
}
