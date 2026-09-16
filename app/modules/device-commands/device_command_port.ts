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
  /**
   * Cierra lo que siga vivo para ese vinculo. Devuelve cuantos cerro.
   *
   * Se usa al cerrar a mano una baja que el equipo nunca confirmo, y al pedir
   * una baja mientras el alta sigue en cola: el comando pendiente ya no aplica,
   * y dejarlo vivo taponaria la cola de ese aparato --o, peor, volveria a dar
   * de alta a quien se acaba de sacar--.
   *
   * Lo `pending` se cancela; lo `sent` se da por fallido, porque ya viajo al
   * aparato y la maquina no admite cancelarlo (spec 6.2).
   */
  cancelLiveForPivot(
    accessPointEmployeeId: number,
    requestedByUserId: number | null
  ): Promise<number>
  /**
   * Cancela las copias de huella que siguen vivas hacia un equipo.
   *
   * Se usa cuando el aparato cambia de version de algoritmo: lo que este en la
   * cola lleva un template de la generacion anterior, que ese equipo ya no
   * sabe leer. Dejarlo vivo solo gasta un turno de despacho para que el
   * template se descarte dentro del aparato sin decir nada.
   */
  cancelFingerprintWritesFor(accessPointId: number): Promise<number>
  /** El comando de ESE equipo, o `null`. La pertenencia va en la consulta. */
  findForDevice(commandId: number, accessPointId: number): Promise<DeviceCommand | null>
  retry(commandId: number, requestedByUserId: number | null): Promise<DeviceCommand>
  listByDevice(accessPointId: number, status?: DeviceCommandStatus): Promise<DeviceCommand[]>
  listByEmployee(employeeId: number): Promise<DeviceCommand[]>
}
