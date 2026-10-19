import type { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { AccessPointEmployeeSyncStatus } from '#models/access_point_employee'
import type { AccessPointResyncResolution } from './resync_pending.constants.js'

/** Vínculo que la baja revocó y que sigue en camino de baja o ya borrado. */
export interface ResyncPendingCandidate {
  accessPointEmployeeId: number
  status: AccessPointEmployeeSyncStatus
}

export interface ResyncPendingMarkInput {
  businessUnitId: number
  employeeId: number
  accessPointEmployeeId: number
  statusAtMark: AccessPointEmployeeSyncStatus
  markedByUserId: number | null
}

/** Marca abierta unida a su vínculo vivo en camino de baja y a su checador vivo. */
export interface OpenResyncPendingRow {
  accessPointResyncPendingId: number
  accessPointEmployeeId: number
  accessPointId: number
  accessPointName: string
  syncStatus: AccessPointEmployeeSyncStatus
  markedAt: DateTime
}

/**
 * Puerto de las marcas de checadores pendientes (VLRH-H1790812613831). El
 * aislamiento por empresa va EXPLÍCITO en cada consulta (R4): las escrituras
 * corren dentro de la transacción de la reactivación con `trx`.
 */
export interface ResyncPendingRepository {
  /**
   * Cierra como `superseded` las marcas abiertas del colaborador cuyo vínculo
   * ya no está en camino de baja ni borrado, o fue retirado (regla 5).
   */
  supersedeStaleOpen(
    employeeId: number,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<number>

  /**
   * Vínculos vivos del colaborador en camino de baja o borrados con un pedido de
   * borrado registrado en o después de la fecha de baja del colaborador
   * (`employees.employee_deleted_at`, leída en la misma transacción).
   */
  listRevokedByTermination(
    employeeId: number,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<ResyncPendingCandidate[]>

  /** Vínculos del colaborador que ya tienen marca abierta. */
  listOpenPivotIds(
    employeeId: number,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<number[]>

  insertMarks(rows: ResyncPendingMarkInput[], trx: TransactionClientContract): Promise<void>

  /** Cierra la marca abierta del vínculo con la resolución dada; sin marca, no hace nada. */
  resolveOpenForPivot(
    accessPointEmployeeId: number,
    resolution: AccessPointResyncResolution,
    trx?: TransactionClientContract
  ): Promise<void>

  /** Marcas abiertas con vínculo vivo en camino de baja y checador vivo, por nombre del checador. */
  listOpenByEmployee(employeeId: number, businessUnitId: number): Promise<OpenResyncPendingRow[]>
}
