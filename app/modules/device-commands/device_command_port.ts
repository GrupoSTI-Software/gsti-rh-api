import type DeviceCommand from '#models/device_command'
import type { DeviceCommandFields } from './wire/adms_command_formatter.js'
import type { DeviceCommandKind, DeviceCommandStatus } from './device_command.constants.js'

export interface EnqueueCommandInput {
  accessPointId: number
  businessUnitId: number
  kind: DeviceCommandKind
  fields: DeviceCommandFields
  employeeId?: number | null
  accessPointEmployeeId?: number | null
  /**
   * Llave de idempotencia dentro del dispositivo. Con un comando `pending` o
   * `sent` de la misma llave, el encolado devuelve el existente en vez de
   * crear otro: dos pestañas del Backoffice no pueden mandar dos altas del
   * mismo colaborador al mismo equipo.
   */
  correlationKey?: string | null
  priority?: number
  maxAttempts?: number | null
  requestedByUserId?: number | null
  biometricTemplateId?: number | null
  biometricPhotoPublicationId?: number | null
}

export interface EnqueueCommandResult {
  command: DeviceCommand
  /** Falso cuando ya existia uno vivo con la misma llave de correlacion. */
  created: boolean
}

/**
 * Contrato unico para mandar ordenes al checador (spec ADMS 6.1). Ninguna otra
 * pieza escribe en `device_commands`.
 */
export interface DeviceCommandPort {
  enqueue(input: EnqueueCommandInput): Promise<EnqueueCommandResult>
  cancel(commandId: number, requestedByUserId: number | null): Promise<DeviceCommand>
  retry(commandId: number, requestedByUserId: number | null): Promise<DeviceCommand>
  listByDevice(accessPointId: number, status?: DeviceCommandStatus): Promise<DeviceCommand[]>
  listByEmployee(employeeId: number): Promise<DeviceCommand[]>
}
