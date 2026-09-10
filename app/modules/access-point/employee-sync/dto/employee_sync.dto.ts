import type AccessPointEmployee from '#models/access_point_employee'
import type { AccessPointEmployeeSyncStatus } from '#models/access_point_employee'
import { isPinQuarantined } from '../employee_sync_state.js'

export interface EmployeeSyncDto {
  accessPointEmployeeId: number
  accessPointId: number
  employeeId: number
  /**
   * Si ya tiene numero en ese equipo, no cual.
   *
   * El PIN es la credencial con la que se marca: quien lo conoce puede
   * teclearlo en el aparato y checar por otro. Ninguna respuesta del cliente lo
   * lleva; para operar basta saber si el alta puede salir.
   */
  hasPin: boolean
  syncStatus: AccessPointEmployeeSyncStatus
  /** La baja va en camino: el numero sigue reservado para esta persona. */
  pinQuarantined: boolean
  syncRequestedAt: string | null
  syncSentAt: string | null
  syncConfirmedAt: string | null
  syncFailedAt: string | null
  syncFailureReason: string | null
}

export function toEmployeeSyncDto(pivot: AccessPointEmployee): EmployeeSyncDto {
  const pin = pivot.accessPointEmployeePin
  return {
    accessPointEmployeeId: pivot.accessPointEmployeeId,
    accessPointId: pivot.accessPointId,
    employeeId: pivot.employeeId,
    hasPin: Boolean(pin && pin.length > 0),
    syncStatus: pivot.accessPointEmployeeSyncStatus,
    pinQuarantined: isPinQuarantined(pivot.accessPointEmployeeSyncStatus),
    syncRequestedAt: pivot.accessPointEmployeeSyncRequestedAt?.toISO() ?? null,
    syncSentAt: pivot.accessPointEmployeeSyncSentAt?.toISO() ?? null,
    syncConfirmedAt: pivot.accessPointEmployeeSyncConfirmedAt?.toISO() ?? null,
    syncFailedAt: pivot.accessPointEmployeeSyncFailedAt?.toISO() ?? null,
    syncFailureReason: pivot.accessPointEmployeeSyncFailureReason ?? null,
  }
}
