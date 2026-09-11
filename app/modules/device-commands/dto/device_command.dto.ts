import { DateTime } from 'luxon'
import type DeviceCommand from '#models/device_command'
import {
  DEVICE_COMMAND_STALE_PENDING_MINUTES,
  DEVICE_COMMAND_STATUS,
  type DeviceCommandKind,
  type DeviceCommandStatus,
} from '../device_command.constants.js'

export interface DeviceCommandDto {
  id: number
  kind: DeviceCommandKind
  status: DeviceCommandStatus
  /** Pendiente cuyo equipo lleva rato sin dar senales (spec 6.2, decision D4). */
  stale: boolean
  pendingSince: string | null
  priority: number
  attempts: number
  maxAttempts: number | null
  returnCode: number | null
  lastError: string | null
  executionEvidence: string | null
  employeeId: number | null
  sentAt: string | null
  ackedAt: string | null
  executedAt: string | null
  failedAt: string | null
  createdAt: string | null
}

/**
 * Vista del comando para el Backoffice (spec 11).
 *
 * NUNCA lleva `payload`: en un `biodata_write` es el template biometrico
 * completo. Tampoco la evidencia cruda ni los contadores.
 */
export function toDeviceCommandDto(
  command: DeviceCommand,
  lastSeenAt: DateTime | null,
  now: DateTime
): DeviceCommandDto {
  const isPending = command.deviceCommandStatus === DEVICE_COMMAND_STATUS.PENDING
  const staleSince = now.minus({ minutes: DEVICE_COMMAND_STALE_PENDING_MINUTES })
  const stale = isPending && (lastSeenAt === null || lastSeenAt < staleSince)

  return {
    id: command.deviceCommandId,
    kind: command.deviceCommandKind,
    status: command.deviceCommandStatus,
    stale,
    pendingSince: isPending ? (command.deviceCommandCreatedAt?.toISO() ?? null) : null,
    priority: command.deviceCommandPriority,
    attempts: command.deviceCommandAttempts,
    maxAttempts: command.deviceCommandMaxAttempts ?? null,
    returnCode: command.deviceCommandReturnCode ?? null,
    lastError: command.deviceCommandLastError ?? null,
    executionEvidence: command.deviceCommandExecutionEvidence ?? null,
    employeeId: command.employeeId ?? null,
    sentAt: command.deviceCommandSentAt?.toISO() ?? null,
    ackedAt: command.deviceCommandAckedAt?.toISO() ?? null,
    executedAt: command.deviceCommandExecutedAt?.toISO() ?? null,
    failedAt: command.deviceCommandFailedAt?.toISO() ?? null,
    createdAt: command.deviceCommandCreatedAt?.toISO() ?? null,
  }
}
