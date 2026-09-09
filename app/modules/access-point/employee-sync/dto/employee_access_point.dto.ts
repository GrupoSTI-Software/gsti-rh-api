import type AccessPoint from '#models/access_point'
import type AccessPointEmployee from '#models/access_point_employee'
import type { AccessPointEmployeeSyncStatus } from '#models/access_point_employee'
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
  /**
   * Si ya tiene numero en ese equipo, no cual.
   *
   * El PIN es la credencial con la que se marca: quien lo conoce puede
   * teclearlo en el aparato y checar por otro. La pantalla del cliente solo
   * necesita saber si el alta puede salir, y para eso basta el booleano.
   */
  hasPin: boolean
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

/** Biometricos que el colaborador tiene resguardados, por modalidad. */
export interface EmployeeBiometricSummaryDto {
  fingerprints: number
  faces: number
  palms: number
}

export interface EmployeeDevicesDto {
  employeeId: number
  accessPoints: EmployeeAccessPointDto[]
  biometrics: EmployeeBiometricSummaryDto
}
