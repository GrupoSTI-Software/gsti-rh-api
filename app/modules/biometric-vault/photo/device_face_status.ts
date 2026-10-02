import type { DateTime } from 'luxon'
import AccessPointProfile from '#models/access_point_profile'
import DeviceCommand from '#models/device_command'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import { DEVICE_FACE_SUPPORT, faceSupportOf, type DeviceFaceSupport } from './device_face_support.js'

export const FACE_PHOTO_DEVICE_STATUS = {
  /** El equipo tiene la foto: la descargo y acuso, o lo probo despues. */
  LOADED: 'loaded',
  /** En cola, en vuelo o acusada sin prueba todavia. */
  SENDING: 'sending',
  /** No entro. `reason` dice por que. */
  FAILED: 'failed',
  /** El uso esta encendido y a este equipo aun no se le ha mandado. */
  NOT_SENT: 'not_sent',
  /** El equipo declaro no tener rostro. */
  UNSUPPORTED: 'unsupported',
  /** Se pidio quitarla y el equipo no ha acusado. */
  REMOVING: 'removing',
  /** Se pidio quitarla y el equipo lo rechazo. */
  REMOVE_FAILED: 'remove_failed',
} as const

export type FacePhotoDeviceStatusKind =
  (typeof FACE_PHOTO_DEVICE_STATUS)[keyof typeof FACE_PHOTO_DEVICE_STATUS]

export interface FacePhotoDeviceStatus {
  status: FacePhotoDeviceStatusKind
  /** Codigo corto del fallo (`photo_not_downloaded`, `no_evidence`, `device_reports_no_faces`...). */
  reason: string | null
  at: string | null
}

/** Lo minimo de un comando que hace falta para leer su estado. */
export interface FaceCommandView {
  id: number
  status: string
  lastError: string | null
  executedAt: DateTime | null
  failedAt: DateTime | null
  updatedAt: DateTime | null
}

const LIVE: ReadonlySet<string> = new Set([
  DEVICE_COMMAND_STATUS.PENDING,
  DEVICE_COMMAND_STATUS.SENT,
  DEVICE_COMMAND_STATUS.ACKED,
])

/**
 * Estado de la foto del colaborador en UN checador.
 *
 * Manda el ultimo movimiento: si despues del envio se pidio quitarla, lo que
 * importa es el borrado. Una foto "cargada" que el propio aparato desmiente con
 * su contador de rostros en cero despues del acuse se reporta como fallida: el
 * contador del equipo es la unica palabra que vale sobre su contenido.
 */
export function resolveFacePhotoStatus(input: {
  deviceUse: boolean
  support: DeviceFaceSupport
  latestWrite: FaceCommandView | null
  latestDelete: FaceCommandView | null
  /** Desde cuando el equipo declara cero rostros; `null` si no lo desmiente. */
  faceCountZeroSince: DateTime | null
}): FacePhotoDeviceStatus | null {
  const { latestWrite, latestDelete } = input
  const at = (command: FaceCommandView): string | null =>
    (command.executedAt ?? command.failedAt ?? command.updatedAt)?.toISO() ?? null

  if (latestDelete && (!latestWrite || latestDelete.id > latestWrite.id)) {
    if (LIVE.has(latestDelete.status)) {
      return { status: FACE_PHOTO_DEVICE_STATUS.REMOVING, reason: null, at: at(latestDelete) }
    }
    if (latestDelete.status === DEVICE_COMMAND_STATUS.FAILED) {
      return {
        status: FACE_PHOTO_DEVICE_STATUS.REMOVE_FAILED,
        reason: latestDelete.lastError,
        at: at(latestDelete),
      }
    }
    return null
  }

  if (!input.deviceUse) return null

  if (input.support === DEVICE_FACE_SUPPORT.UNSUPPORTED) {
    return { status: FACE_PHOTO_DEVICE_STATUS.UNSUPPORTED, reason: null, at: null }
  }

  if (!latestWrite) return { status: FACE_PHOTO_DEVICE_STATUS.NOT_SENT, reason: null, at: null }

  if (LIVE.has(latestWrite.status)) {
    return { status: FACE_PHOTO_DEVICE_STATUS.SENDING, reason: null, at: at(latestWrite) }
  }
  if (latestWrite.status === DEVICE_COMMAND_STATUS.EXECUTED) {
    const denied =
      input.faceCountZeroSince !== null &&
      (latestWrite.executedAt === null || latestWrite.executedAt <= input.faceCountZeroSince)
    if (denied) {
      return {
        status: FACE_PHOTO_DEVICE_STATUS.FAILED,
        reason: 'device_reports_no_faces',
        at: input.faceCountZeroSince?.toISO() ?? null,
      }
    }
    return { status: FACE_PHOTO_DEVICE_STATUS.LOADED, reason: null, at: at(latestWrite) }
  }
  return {
    status: FACE_PHOTO_DEVICE_STATUS.FAILED,
    reason: latestWrite.lastError,
    at: at(latestWrite),
  }
}

/** Lee de la base lo necesario y resuelve el estado. */
export async function loadFacePhotoStatus(
  employeeId: number,
  accessPointId: number,
  profile?: AccessPointProfile | null
): Promise<FacePhotoDeviceStatus | null> {
  const faceId = await EmployeeBiometricFaceId.query()
    .where('employee_id', employeeId)
    .whereNull('employee_biometric_face_id_deleted_at')
    .first()
  const resolvedProfile =
    profile !== undefined
      ? profile
      : await AccessPointProfile.query().where('access_point_id', accessPointId).first()

  const latest = async (kind: string): Promise<FaceCommandView | null> => {
    const row = await DeviceCommand.query()
      .where('access_point_id', accessPointId)
      .where('employee_id', employeeId)
      .where('device_command_kind', kind)
      .whereNotIn('device_command_status', [
        DEVICE_COMMAND_STATUS.CANCELLED,
        DEVICE_COMMAND_STATUS.EXPIRED,
      ])
      .orderBy('device_command_id', 'desc')
      .first()
    if (!row) return null
    return {
      id: row.deviceCommandId,
      status: row.deviceCommandStatus,
      lastError: row.deviceCommandLastError,
      executedAt: row.deviceCommandExecutedAt,
      failedAt: row.deviceCommandFailedAt,
      updatedAt: row.deviceCommandUpdatedAt,
    }
  }

  const faceCount = resolvedProfile?.accessPointProfileFaceCount ?? null
  const readAt = resolvedProfile?.accessPointProfileOptionsReadAt ?? null

  return resolveFacePhotoStatus({
    deviceUse: faceId?.employeeBiometricFaceIdDeviceUse === true,
    support: faceSupportOf(resolvedProfile ?? null),
    latestWrite: await latest(DEVICE_COMMAND_KIND.BIOPHOTO_WRITE),
    latestDelete: await latest(DEVICE_COMMAND_KIND.BIOPHOTO_DELETE),
    faceCountZeroSince: faceCount === 0 ? readAt : null,
  })
}
