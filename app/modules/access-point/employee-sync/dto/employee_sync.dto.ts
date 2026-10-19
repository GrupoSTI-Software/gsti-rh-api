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
   * teclearlo en el aparato y checar por otro. Ninguna respuesta lo lleva:
   * para operar basta saber si el alta puede salir. Tampoco el padron del
   * checador compartido para el personal de otra empresa
   * (`ForeignEmployeeSyncDto`).
   */
  hasPin: boolean
  syncStatus: AccessPointEmployeeSyncStatus
  /** La baja va en camino: el numero sigue reservado para esta persona. */
  pinQuarantined: boolean
  /**
   * El vinculo se retiro (baja logica) sin pasar por el aparato: p. ej. un
   * `pending_pin` cerrado a mano, que nunca llego al equipo.
   */
  detached: boolean
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
    detached: pivot.deletedAt !== null && pivot.deletedAt !== undefined,
    syncRequestedAt: pivot.accessPointEmployeeSyncRequestedAt?.toISO() ?? null,
    syncSentAt: pivot.accessPointEmployeeSyncSentAt?.toISO() ?? null,
    syncConfirmedAt: pivot.accessPointEmployeeSyncConfirmedAt?.toISO() ?? null,
    syncFailedAt: pivot.accessPointEmployeeSyncFailedAt?.toISO() ?? null,
    syncFailureReason: pivot.accessPointEmployeeSyncFailureReason ?? null,
  }
}

/**
 * Persona de otra empresa en el padron: solo lo necesario para identificarla.
 * Sin PIN: es la credencial con la que se marca, y quien la conoce puede
 * checar por otro.
 */
export interface ForeignEmployeeSyncDto {
  foreign: true
  employeeId: number
  fullName: string
  /** Solo una URL publica; una foto privada sale `null` (nunca la llave del bucket). */
  photoUrl: string | null
  businessUnitName: string
  syncStatus: AccessPointEmployeeSyncStatus
}

export type OwnEmployeeSyncDto = EmployeeSyncDto & { foreign: false; businessUnitName: string }

export type RosterEntryDto = OwnEmployeeSyncDto | ForeignEmployeeSyncDto

/** Identidad minima de un empleado ajeno, resuelta por lote. */
export interface ForeignEmployeeIdentity {
  fullName: string
  photoUrl: string | null
}

/**
 * Una fila del padron del checador (VLRH-P0065, 6). Si el pivote es de una
 * empresa fuera del alcance de quien mira (`viewerBusinessUnitIds`), solo se
 * entrega la proyeccion de identificacion: nada de codigo de empleado,
 * templates ni expediente.
 */
export function toRosterEntryDto(
  pivot: AccessPointEmployee,
  viewerBusinessUnitIds: number[],
  businessUnitNames: Map<number, string>,
  identities: Map<number, ForeignEmployeeIdentity>
): RosterEntryDto {
  const businessUnitName = businessUnitNames.get(pivot.businessUnitId as number) ?? ''
  if (viewerBusinessUnitIds.includes(pivot.businessUnitId as number)) {
    return { ...toEmployeeSyncDto(pivot), foreign: false, businessUnitName }
  }
  const identity = identities.get(pivot.employeeId)
  return {
    foreign: true,
    employeeId: pivot.employeeId,
    fullName: identity?.fullName ?? '',
    photoUrl: identity?.photoUrl ?? null,
    businessUnitName,
    syncStatus: pivot.accessPointEmployeeSyncStatus,
  }
}
