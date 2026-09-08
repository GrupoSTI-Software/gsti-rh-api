import type { DateTime } from 'luxon'
import type DeviceCommand from '#models/device_command'
import type { DeviceCommandKind, DeviceCommandStatus } from './device_command.constants.js'

export interface CommandInsert {
  wireId: number
  accessPointId: number
  businessUnitId: number
  kind: DeviceCommandKind
  payload: string
  priority: number
  maxAttempts: number | null
  employeeId: number | null
  accessPointEmployeeId: number | null
  correlationKey: string | null
  requestedByUserId: number | null
  biometricTemplateId: number | null
  biometricPhotoPublicationId: number | null
}

/** Puerto de persistencia de la cola. El servicio no toca Lucid. */
export interface DeviceCommandRepository {
  /**
   * Corre `fn` con la fila del punto de acceso bloqueada, para que dos altas
   * simultaneas del mismo colaborador no creen dos comandos.
   */
  withDeviceLock<T>(accessPointId: number, fn: () => Promise<T>): Promise<T>
  findLiveByCorrelation(accessPointId: number, correlationKey: string): Promise<DeviceCommand | null>
  insert(input: CommandInsert): Promise<DeviceCommand>
  findById(commandId: number): Promise<DeviceCommand | null>
  findByWireId(wireId: number): Promise<DeviceCommand | null>
  /** Primer pendiente por prioridad, excluyendo los tipos que no se pueden despachar ahora. */
  findNextPending(accessPointId: number, excludedKinds: DeviceCommandKind[]): Promise<DeviceCommand | null>
  hasInFlight(accessPointId: number): Promise<boolean>
  listByDevice(accessPointId: number, status?: DeviceCommandStatus): Promise<DeviceCommand[]>
  listByEmployee(employeeId: number): Promise<DeviceCommand[]>
  /** Comandos en vuelo o acusados cuyo plazo vencio, para el barrido. */
  findStuck(input: {
    sentBefore: DateTime
    enrollSentBefore: DateTime
    ackedBefore: DateTime
    limit: number
  }): Promise<DeviceCommand[]>
  save(command: DeviceCommand): Promise<void>
}
