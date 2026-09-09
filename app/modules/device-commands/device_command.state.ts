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
