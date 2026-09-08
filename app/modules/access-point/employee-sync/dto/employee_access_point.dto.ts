import type AccessPoint from '#models/access_point'
import type AccessPointEmployee from '#models/access_point_employee'
import type {
  AccessPointEmployeePinSource,
  AccessPointEmployeeSyncStatus,
} from '#models/access_point_employee'
import type { DateTime } from 'luxon'
import type { AdmsHealthStatus } from '#modules/access-point/health/health.constants'
import { statusOf } from '#modules/access-point/health/health.service'
import { isPinQuarantined } from '../employee_sync_state.js'

/**
 * Un checador desde la mirada del colaborador.
 *
 * La pantalla de biometricos pregunta al reves que la de equipos: no "quien
 * esta en este aparato" sino "en que aparatos esta esta persona, con que numero
 * y si el alta llego". Sin el estado, cada boton opera a ciegas: el servidor no
 * puede empujar nada al equipo, solo dejarlo en cola, y una espera sin estado
 * visible se lee como una pantalla colgada.
 */
export interface EmployeeAccessPointDto {
  accessPointId: number
  name: string
  serialNumber: string | null
  active: boolean
  /** Estado de conexion del equipo al momento de la consulta. */
  connection: AdmsHealthStatus
  lastSeenAt: string | null
  pin: string | null
  pinSource: AccessPointEmployeePinSource
  syncStatus: AccessPointEmployeeSyncStatus
  /** El PIN no se puede reasignar a otra persona mientras esto sea verdadero. */
  pinQuarantined: boolean
  syncRequestedAt: string | null
  syncSentAt: string | null
  syncConfirmedAt: string | null
  syncFailedAt: string | null
  syncFailureReason: string | null
}

export function toEmployeeAccessPointDto(
  pivot: AccessPointEmployee,
  accessPoint: AccessPoint,
  now: DateTime
): EmployeeAccessPointDto {
  const pin = pivot.accessPointEmployeePin
  return {
    accessPointId: accessPoint.accessPointId,
    name: accessPoint.accessPointName,
    serialNumber: accessPoint.accessPointSerialNumber,
    active: accessPoint.accessPointActive === 1,
    connection: statusOf(accessPoint.accessPointLastConnection, now),
    lastSeenAt: accessPoint.accessPointLastConnection?.toISO() ?? null,
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

/** Biometricos que el colaborador tiene resguardados, por modalidad. */
export interface EmployeeBiometricSummaryDto {
  fingerprints: number
  faces: number
  palms: number
}

export interface EmployeeDevicesDto {
  employeeId: number
  /**
   * PIN que se propone cuando el colaborador entra a un equipo nuevo.
   *
   * Es su codigo de empleado: es el numero con el que los equipos ya venian
   * cargados y el que el canal infiere cuando ve un PIN suelto, asi que
   * proponer otro obligaria a reconciliar a mano lo que hoy casa solo.
   */
  suggestedPin: string | null
  accessPoints: EmployeeAccessPointDto[]
  biometrics: EmployeeBiometricSummaryDto
}
