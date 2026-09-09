import type AccessPoint from '#models/access_point'
import type AccessPointEmployee from '#models/access_point_employee'
import type { AccessPointEmployeeSyncStatus } from '#models/access_point_employee'
import type { DateTime } from 'luxon'
import type { AdmsHealthStatus } from '#modules/access-point/health/health.constants'
import { statusOf } from '#modules/access-point/health/health.service'
import { isPinQuarantined } from '../employee_sync_state.js'

/**
 * Con que puede identificarse la persona EN ESE equipo, y con que todavia no.
 *
 * `fingerprints` y `faces` cuentan solo lo que consta dentro del aparato. Lo
 * acusado va aparte en `onTheWay`: el equipo dijo haber recibido la copia pero
 * la prueba de que quedo guardada llega despues --un contador que sube, una
 * checada con ese dedo-- y a veces no llega nunca. Contarlo como presente es lo
 * que hacia que un checador con cero huellas se anunciara con la etiqueta de
 * huella.
 */
export interface EmployeeAccessPointBiometricsDto {
  fingerprints: number
  faces: number
  /** Copias acusadas por el equipo, sin prueba de que quedaran dentro. */
  onTheWay: { fingerprints: number; faces: number }
}

/** Equipo sin nada: ni dentro ni en camino. */
export const EMPTY_DEVICE_BIOMETRICS: EmployeeAccessPointBiometricsDto = {
  fingerprints: 0,
  faces: 0,
  onTheWay: { fingerprints: 0, faces: 0 },
}

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
  /**
   * Modalidades con las que la persona puede identificarse EN ESTE equipo.
   *
   * No es lo que tiene en su expediente: la boveda guarda un dato por dedo y
   * version, y un template capturado en un aparato no dice nada de lo que hay
   * dentro de otro. Repetir aqui el consolidado del colaborador es lo que hacia
   * que dos checadores incompatibles se pintaran igual.
   */
  biometrics: EmployeeAccessPointBiometricsDto
  /**
   * Incidente que retiene las copias de biometricos hacia este equipo.
   *
   * El canal no le despacha templates ni fotos mientras siga abierto. Va en la
   * ficha del checador porque es ahi donde se da de alta a alguien y donde se
   * nota que no llego nada.
   */
  withheldBy: { incidentId: number; kind: string; since: string | null } | null
  /** La baja va en camino: el numero sigue reservado para esta persona. */
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
  now: DateTime,
  biometrics: EmployeeAccessPointBiometricsDto = EMPTY_DEVICE_BIOMETRICS,
  withheldBy: { incidentId: number; kind: string; since: string | null } | null = null
): EmployeeAccessPointDto {
  const pin = pivot.accessPointEmployeePin
  return {
    accessPointId: accessPoint.accessPointId,
    name: accessPoint.accessPointName,
    serialNumber: accessPoint.accessPointSerialNumber,
    active: accessPoint.accessPointActive === 1,
    connection: statusOf(accessPoint.accessPointLastConnection, now),
    lastSeenAt: accessPoint.accessPointLastConnection?.toISO() ?? null,
    biometrics,
    withheldBy,
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

/**
 * Un checador al que todavia se puede meter al colaborador.
 *
 * Lleva lo que hace falta para reconocerlo al elegirlo: el alias que le puso la
 * empresa, el nombre que el propio aparato declara y su modelo, que es lo que
 * resuelve la imagen. La unidad de negocio no distingue nada cuando todos los
 * equipos son de la misma.
 */
export interface EmployeeAvailableAccessPointDto {
  accessPointId: number
  name: string
  deviceName: string | null
  serialNumber: string | null
  connection: AdmsHealthStatus
  model: {
    platformDeviceModelId: number
    brand: string
    name: string
    slug: string
  } | null
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
  /** Equipos de la empresa donde la persona todavia no esta dada de alta. */
  available: EmployeeAvailableAccessPointDto[]
  biometrics: EmployeeBiometricSummaryDto
}
