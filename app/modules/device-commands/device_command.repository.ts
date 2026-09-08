import type { DateTime } from 'luxon'
import type DeviceCommand from '#models/device_command'
import type { DeviceCommandKind, DeviceCommandStatus } from './device_command.constants.js'

export interface CommandInsert {
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

export interface EnqueueIdempotentResult {
  command: DeviceCommand
  created: boolean
}

/** Puerto de persistencia de la cola. El servicio no toca Lucid. */
export interface DeviceCommandRepository {
  /**
   * Busca por llave de correlacion e inserta, todo dentro de UNA transaccion
   * con la fila del punto de acceso bloqueada.
   *
   * Es una sola operacion y no dos a proposito: `device_commands` referencia a
   * `access_points`, asi que un insert desde fuera de la transaccion que tiene
   * el bloqueo se queda esperando ese mismo candado hasta agotar el tiempo.
   *
   * `wireIdCandidates` viene ya calculado por el dominio; el adaptador prueba
   * en orden hasta que uno no choque con la UNIQUE.
   */
  enqueueIdempotent(
    input: CommandInsert,
    wireIdCandidates: number[]
  ): Promise<EnqueueIdempotentResult | null>
  findLiveByCorrelation(accessPointId: number, correlationKey: string): Promise<DeviceCommand | null>
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
