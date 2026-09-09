import type { DateTime } from 'luxon'
import type DeviceCommand from '#models/device_command'
import type { DeviceCommandKind, DeviceCommandStatus } from './device_command.constants.js'

export interface CommandInsert {
  accessPointId: number
  businessUnitId: number
  kind: DeviceCommandKind
  payload: string
  /** En claro, para que la evidencia correlacione sin descifrar el payload. */
  pin: string | null
  bioNo: number | null
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
  /**
   * Marca un pendiente como enviado, y solo si SIGUE pendiente.
   *
   * El equipo sondea cada pocos segundos y reintenta cuando la respuesta
   * tarda, asi que dos peticiones pueden ver la cola libre a la vez y elegir el
   * mismo comando. Sin esta condicion las dos entregarian la misma orden: dos
   * sesiones de enrolamiento abiertas, dos acuses con el mismo identificador.
   *
   * Devuelve falso si otra peticion se lo llevo primero; el que pierde no
   * entrega nada.
   */
  markSent(input: { commandId: number; payload: string; sentAt: DateTime }): Promise<boolean>
  /**
   * Falla un comando solo si sigue en el estado en que se leyo.
   *
   * El barrido lee una tanda y la procesa en fila: entre la lectura y la
   * escritura puede haber llegado el acuse. Escribir sin condicion pondria
   * "fallo" sobre una orden que el equipo si ejecuto, y el operador la
   * reintentaria.
   */
  markFailedIfStill(input: {
    commandId: number
    expectedStatus: DeviceCommandStatus
    failedAt: DateTime
    error: string
  }): Promise<boolean>
  /**
   * Comandos de ese equipo que todavia esperan prueba de ejecucion.
   *
   * `sent` y `acked` los dos: el equipo puede subir la huella ANTES de que su
   * acuse llegue, y descartar esa prueba por llegar en desorden dejaria el
   * comando colgado hasta que el barrido lo diera por fallido.
   *
   * Se filtra por PIN y numero de biometrico en claro; el payload va cifrado y
   * descifrar la cola entera para buscar no es una opcion.
   */
  findAwaitingEvidence(input: {
    accessPointId: number
    kinds: DeviceCommandKind[]
    pin?: string
    bioNo?: number
  }): Promise<DeviceCommand[]>
  save(command: DeviceCommand): Promise<void>
}
