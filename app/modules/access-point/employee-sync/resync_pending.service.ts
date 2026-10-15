import type { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import logger from '@adonisjs/core/services/logger'
import { ACCESS_POINT_RESYNC_RESOLUTION, requiredActionFor } from './resync_pending.constants.js'
import ResyncPendingRepositoryMysql from './resync_pending.repository.mysql.js'
import type { OpenResyncPendingRow, ResyncPendingRepository } from './resync_pending.repository.js'

/** Lo único que `EmployeeSyncService` necesita de las marcas: cerrar la del vínculo que revive. */
export interface ResyncPendingCloser {
  resolveForPivot(accessPointEmployeeId: number): Promise<void>
}

export interface RecordOnReactivationInput {
  trx: TransactionClientContract
  businessUnitId: number
  employeeId: number
  /** Fecha de baja leída con candado; solo guarda que no sea nula. */
  terminatedAt: DateTime
  actorUserId: number | null
}

/**
 * Checadores pendientes de sincronizar tras deshacer una baja
 * (VLRH-H1790812613831). El dato solo se puede calcular al reactivar: después,
 * una revocación de la baja y una manual se ven iguales. El sistema nunca
 * re-enrola; RH lo hace con las acciones que ya existen.
 */
export default class ResyncPendingService implements ResyncPendingCloser {
  constructor(
    private readonly repository: ResyncPendingRepository = new ResyncPendingRepositoryMysql()
  ) {}

  /**
   * Dentro de la transacción de la reactivación, antes de limpiar la fecha de
   * baja: (1) cierra como `superseded` las marcas abiertas cuyo vínculo ya salió
   * del camino de baja (regla 5); (2) toma los vínculos que la baja revocó
   * (regla 1); (3) marca los que aún no tienen marca abierta. Devuelve cuántas
   * abrió. Lanza ante cualquier fallo: la reactivación completa revierte (R3).
   */
  async recordOnReactivation(input: RecordOnReactivationInput): Promise<number> {
    const { trx, businessUnitId, employeeId, actorUserId } = input
    const superseded = await this.repository.supersedeStaleOpen(employeeId, businessUnitId, trx)
    const candidates = await this.repository.listRevokedByTermination(
      employeeId,
      businessUnitId,
      trx
    )
    const alreadyOpen = new Set(
      await this.repository.listOpenPivotIds(employeeId, businessUnitId, trx)
    )
    const rows = candidates
      .filter((candidate) => !alreadyOpen.has(candidate.accessPointEmployeeId))
      .map((candidate) => ({
        businessUnitId,
        employeeId,
        accessPointEmployeeId: candidate.accessPointEmployeeId,
        statusAtMark: candidate.status,
        markedByUserId: actorUserId,
      }))
    await this.repository.insertMarks(rows, trx)
    // Solo ids: sin nombres de checador ni datos personales
    logger.info(
      { actorUserId, employeeId, businessUnitId, opened: rows.length, superseded },
      'ResyncPendingService.recordOnReactivation'
    )
    return rows.length
  }

  /** La persona volvió a quedar asignada en ese checador: la marca abierta se cierra (regla 3). */
  async resolveForPivot(accessPointEmployeeId: number): Promise<void> {
    await this.repository.resolveOpenForPivot(
      accessPointEmployeeId,
      ACCESS_POINT_RESYNC_RESOLUTION.ASSIGNED
    )
  }

  /**
   * Marcas abiertas que siguen contando (regla 4): vínculo vivo en camino de
   * baja o borrado y checador vivo, de la empresa del colaborador. No escribe.
   */
  async listOpenByEmployee(
    employeeId: number,
    businessUnitId: number
  ): Promise<OpenResyncPendingRow[]> {
    const rows = await this.repository.listOpenByEmployee(employeeId, businessUnitId)
    return rows.filter((row) => requiredActionFor(row.syncStatus) !== null)
  }
}
