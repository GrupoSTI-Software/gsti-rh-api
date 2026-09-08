import type AccessPointEmployee from '#models/access_point_employee'
import type {
  AccessPointEmployeePinSource,
  AccessPointEmployeeSyncStatus,
} from '#models/access_point_employee'
import { isPinQuarantined } from '../employee_sync_state.js'

export interface EmployeeSyncDto {
  accessPointEmployeeId: number
  accessPointId: number
  employeeId: number
  pin: string | null
  pinSource: AccessPointEmployeePinSource
  syncStatus: AccessPointEmployeeSyncStatus
  /** El PIN no se puede reasignar mientras esto sea verdadero. */
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
    pin: pin && pin.length > 0 ? pin : null,
    pinSource: pivot.accessPointEmployeePinSource,
    syncStatus: pivot.accessPointEmployeeSyncStatus,
    pinQuarantined: isPinQuarantined(pivot.accessPointEmployeeSyncStatus),
    syncRequestedAt: pivot.accessPointEmployeeSyncRequestedAt?.toISO() ?? null,
    syncSentAt: pivot.accessPointEmployeeSyncSentAt?.toISO() ?? null,
    syncConfirmedAt: pivot.accessPointEmployeeSyncConfirmedAt?.toISO() ?? null,
    syncFailedAt: pivot.accessPointEmployeeSyncFailedAt?.toISO() ?? null,
    syncFailureReason: pivot.accessPointEmployeeSyncFailureReason ?? null,
  }
}
