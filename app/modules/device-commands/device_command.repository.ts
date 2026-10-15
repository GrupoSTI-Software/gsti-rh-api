import type { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type DeviceCommand from '#models/device_command'
import type { DeviceCommandCountersSnapshot } from '#models/device_command'
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

/**
 * Lo unico que la replicacion y el acuse necesitan saber de la cola: si ya
 * hubo una copia EJECUTADA con esa llave hacia ese equipo.
 *
 * Es un puerto aparte, y no un metodo mas del repositorio completo, para que
 * quien solo hace esta pregunta no cargue con la cola entera ni obligue a cada
 * doble de pruebas a conocerla.
 */
export interface ExecutedCopyLookup {
  /**
   * @param excludeCommandId - El propio comando que se esta acusando: una
   *   recopia solo cuenta como repetida si hubo OTRA entrega antes.
   */
  hasExecutedByCorrelation(
    accessPointId: number,
    correlationKey: string,
    excludeCommandId?: number
  ): Promise<boolean>
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
    wireIdCandidates: number[],
    trx?: TransactionClientContract
  ): Promise<EnqueueIdempotentResult | null>
  findLiveByCorrelation(accessPointId: number, correlationKey: string): Promise<DeviceCommand | null>
  findById(commandId: number, trx?: TransactionClientContract): Promise<DeviceCommand | null>
  /**
   * El comando, solo si es de ESE equipo.
   *
   * La pertenencia se comprueba en el WHERE y no trayendo la lista del
   * dispositivo para buscar en memoria: esa lista esta topada, asi que un
   * comando mas viejo que el tope no se podia ni cancelar ni reintentar.
   */
  findByIdForDevice(commandId: number, accessPointId: number): Promise<DeviceCommand | null>
  findByWireId(wireId: number): Promise<DeviceCommand | null>
  /** Primer pendiente por prioridad, excluyendo los tipos que no se pueden despachar ahora. */
  findNextPending(accessPointId: number, excludedKinds: DeviceCommandKind[]): Promise<DeviceCommand | null>
  hasInFlight(accessPointId: number): Promise<boolean>
  listByDevice(
    accessPointId: number,
    status?: DeviceCommandStatus,
    trx?: TransactionClientContract
  ): Promise<DeviceCommand[]>
  listByEmployee(employeeId: number): Promise<DeviceCommand[]>
  /** Lo que sigue vivo --pendiente o en vuelo-- para un vinculo concreto. */
  listLiveForPivot(
    accessPointEmployeeId: number,
    trx?: TransactionClientContract
  ): Promise<DeviceCommand[]>
  /**
   * Escrituras de huella vivas hacia un equipo.
   *
   * Se resuelve por el tipo del template al que apunta el comando y no por
   * `device_command_bio_no`: ahi el dedo 9 y el rostro comparten numero.
   */
  listLiveFingerprintWrites(accessPointId: number): Promise<DeviceCommand[]>
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
   *
   * `countersSnapshot` es la foto de los contadores del equipo ANTES de que
   * reciba la orden: la linea base con la que despues se acredita que el
   * biometrico entro. Se toma aqui y no al acusar porque hay firmwares que
   * suben `options` antes de acusar, y una foto tomada al acusar ya traia el
   * dato nuevo dentro.
   */
  markSent(input: {
    commandId: number
    payload: string
    sentAt: DateTime
    countersSnapshot?: DeviceCommandCountersSnapshot | null
  }): Promise<boolean>
  /**
   * Cierra un comando en vuelo que agoto su plazo, y solo si SIGUE en vuelo.
   *
   * Vuelve a la cola con un intento mas mientras le queden intentos; al
   * agotarlos queda `failed`. `null` en el maximo es "insiste siempre" (la
   * baja de usuario). Un enrolamiento presencial se falla al primer
   * vencimiento: reabrir la captura sin la persona enfrente no sirve.
   *
   * La linea base de contadores se conserva al reencolar: se tomo antes de
   * que el equipo recibiera la orden y sigue siendo la referencia.
   *
   * Es la UNICA politica de plazo en vuelo: antes el despacho tenia otra, a
   * cinco minutos, que el barrido de cada minuto dejaba sin efecto.
   */
  requeueOrFailIfStill(input: {
    commandId: number
    expectedStatus: DeviceCommandStatus
    now: DateTime
    error: string
  }): Promise<'requeued' | 'failed' | 'untouched'>
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
  /**
   * Dedos distintos (colaborador y numero) que el sistema cree dentro de ese
   * equipo: los capturados ahi mas las copias ejecutadas o acusadas. Es con lo
   * que se compara el contador de huellas del aparato.
   */
  countFingerprintsBelievedInside(accessPointId: number): Promise<number>
  /**
   * Colaboradores con rostro que el sistema cree dentro de ese equipo: template
   * de rostro capturado ahi, copia de rostro o foto ejecutada o acusada.
   */
  countFacesBelievedInside(accessPointId: number): Promise<number>
  save(command: DeviceCommand): Promise<void>
}
