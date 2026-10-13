import { DEVICE_COMMAND_STATUS, type DeviceCommandStatus } from './device_command.constants.js'

/**
 * Maquina de estados de un comando (spec ADMS 6.2).
 *
 * `expired` no tiene entrada desde ningun estado: existe en el enum por
 * decision D4 (nada expira) y ninguna politica lo produce.
 */
const TRANSITIONS: Readonly<Record<DeviceCommandStatus, readonly DeviceCommandStatus[]>> = {
  [DEVICE_COMMAND_STATUS.PENDING]: [
    DEVICE_COMMAND_STATUS.SENT,
    DEVICE_COMMAND_STATUS.CANCELLED,
    DEVICE_COMMAND_STATUS.EXPIRED,
  ],
  [DEVICE_COMMAND_STATUS.SENT]: [
    DEVICE_COMMAND_STATUS.ACKED,
    DEVICE_COMMAND_STATUS.EXECUTED,
    DEVICE_COMMAND_STATUS.FAILED,
  ],
  [DEVICE_COMMAND_STATUS.ACKED]: [DEVICE_COMMAND_STATUS.EXECUTED, DEVICE_COMMAND_STATUS.FAILED],
  [DEVICE_COMMAND_STATUS.FAILED]: [DEVICE_COMMAND_STATUS.PENDING],
  [DEVICE_COMMAND_STATUS.EXECUTED]: [],
  [DEVICE_COMMAND_STATUS.CANCELLED]: [],
  [DEVICE_COMMAND_STATUS.EXPIRED]: [],
}

export function canTransition(from: DeviceCommandStatus, to: DeviceCommandStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function allowedTransitions(from: DeviceCommandStatus): readonly DeviceCommandStatus[] {
  return TRANSITIONS[from]
}

/**
 * Un `pending` que ya viajo: el barrido lo devolvio a la cola con un intento
 * mas y el despacho todavia no lo reenvia. Su acuse puede llegar en ese hueco
 * --el equipo se apago con la orden dentro y la acusa al volver-- y se aplica
 * como si siguiera en vuelo. Un `pending` con cero intentos nunca salio: su
 * acuse sigue siendo `stale`.
 *
 * No se agrega `pending -> acked` a la maquina: la transicion vale solo con
 * esta prueba de que la orden viajo, no para cualquier pendiente.
 */
export function wasDispatchedBefore(command: {
  deviceCommandStatus: DeviceCommandStatus
  deviceCommandAttempts: number
  deviceCommandSentAt: unknown
}): boolean {
  return (
    command.deviceCommandStatus === DEVICE_COMMAND_STATUS.PENDING &&
    command.deviceCommandAttempts > 0 &&
    command.deviceCommandSentAt === null
  )
}
