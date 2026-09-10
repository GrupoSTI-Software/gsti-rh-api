import type { DateTime } from 'luxon'
import DeviceCommandRepositoryMysql from '../device_command.repository.mysql.js'
import {
  ATTLOG_VERIFY_FINGERPRINT,
  DEVICE_COMMAND_EVIDENCE,
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
  type DeviceCommandEvidence,
} from '../device_command.constants.js'
import type { DeviceCommandRepository } from '../device_command.repository.js'
import type DeviceCommand from '#models/device_command'

/** Contadores que el equipo declara en `options`, para comparar con el snapshot. */
export interface DeviceCounters {
  fpCount: number | null
  faceCount: number | null
  userCount: number | null
}

/**
 * Da por ejecutado un comando cuando el propio equipo lo demuestra (spec 6.6).
 *
 * `Return=0` es RECIBIDO, no ejecutado: la bateria en hardware midio un
 * `Return=0` con la foto descartada y otro con el reloj movido 180 dias. La
 * unica prueba que vale es la que llega despues por su cuenta -- la huella
 * subida, la checada hecha con ella, el contador que sube.
 *
 * Nada aqui lanza. La evidencia se descubre mientras se procesa una subida del
 * equipo, y una subida no se puede perder porque no cuadre un comando.
 */
/** Lo que deja una subida de biometrico: que cerro y quien lo habia pedido. */
export interface BiometricUploadEvidence {
  closed: number
  /** Usuario que pidio la captura, cuando la orden salio del sistema. */
  requestedByUserId: number | null
}

export default class ExecutionEvidenceService {
  constructor(
    private readonly repository: DeviceCommandRepository = new DeviceCommandRepositoryMysql()
  ) {}

  /**
   * El equipo subio una huella o un rostro. Cierra el enrolamiento que la pidio.
   *
   * Se busca por PIN y dedo: dos enrolamientos vivos del mismo colaborador en
   * dedos distintos son normales y no pueden cerrarse el uno al otro.
   */
  async fromBiometricUpload(input: {
    accessPointId: number
    pin: string
    bioNo: number
    now: DateTime
  }): Promise<BiometricUploadEvidence> {
    const commands = await this.repository.findAwaitingEvidence({
      accessPointId: input.accessPointId,
      kinds: [DEVICE_COMMAND_KIND.ENROLL_FP],
      pin: input.pin,
      bioNo: input.bioNo,
    })
    const closed = await this.markAll(commands, DEVICE_COMMAND_EVIDENCE.BIOMETRIC_UPLOAD, input.now)

    /**
     * Quien pidio la captura responde tambien por lo que se haga con ella.
     *
     * El canal no tiene sesion, y la boveda no deja leer un biometrico sin
     * saber a nombre de quien: este es el unico humano detras de una huella
     * que acaba de entrar por una orden del sistema.
     */
    const requestedBy =
      commands.map((command) => command.deviceCommandRequestedByUserId).find((id) => id !== null) ??
      null

    return { closed, requestedByUserId: requestedBy }
  }

  /**
   * Una checada verificada con huella prueba que la huella quedo en el equipo.
   *
   * Aqui no hay dedo: la checada no dice con cual se marco, asi que cierra
   * cualquier enrolamiento vivo de ese PIN. Es correcto: si la persona marco
   * con huella, el aparato tiene al menos una suya, que es lo que se pedia.
   */
  async fromPunch(input: {
    accessPointId: number
    pin: string
    verify: number | null
    now: DateTime
  }): Promise<number> {
    if (input.verify !== ATTLOG_VERIFY_FINGERPRINT) return 0
    const commands = await this.repository.findAwaitingEvidence({
      accessPointId: input.accessPointId,
      kinds: [DEVICE_COMMAND_KIND.ENROLL_FP],
      pin: input.pin,
    })
    return this.markAll(commands, DEVICE_COMMAND_EVIDENCE.ATTLOG_VERIFY, input.now)
  }

  /**
   * El contador de huellas del equipo subio respecto al que se guardo al
   * acusar. Es la prueba mas debil de las tres -- no dice de QUIEN es la huella
   * -- asi que solo cierra lo que el alza alcanza a explicar.
   *
   * Cubre tambien las copias: una replicacion no hace que el equipo suba nada
   * --ya tiene el dato-- asi que su unica prueba automatica es este contador.
   * Sin esto, una copia acusada se quedaba esperando para siempre una evidencia
   * que nadie iba a mandar, y el expediente decia que el aparato no tenia la
   * huella que si tenia dentro.
   *
   * La atribucion es por cantidad: si el contador subio al menos tanto como
   * ordenes hay esperando, todas entraron. Si subio menos, no se puede decir
   * cuales, y se prefiere dejarlas abiertas antes que dar por buena la que no
   * fue.
   */
  async fromCounters(input: {
    accessPointId: number
    counters: DeviceCounters
    now: DateTime
  }): Promise<number> {
    if (input.counters.fpCount === null) return 0

    const commands = await this.repository.findAwaitingEvidence({
      accessPointId: input.accessPointId,
      kinds: [DEVICE_COMMAND_KIND.ENROLL_FP, DEVICE_COMMAND_KIND.BIODATA_WRITE],
    })
    const acked = commands.filter(
      (command) =>
        command.deviceCommandStatus === DEVICE_COMMAND_STATUS.ACKED &&
        this.countersRose(command, input.counters)
    )
    if (acked.length === 0) return 0

    /**
     * El alza mas grande entre los pendientes: cada uno guarda su propio
     * snapshot, y el que acuso primero es el que mide el salto completo.
     */
    const rise = Math.max(
      ...acked.map((command) => {
        const before = command.deviceCommandCountersSnapshot?.fpCount ?? 0
        return (input.counters.fpCount ?? 0) - before
      })
    )
    if (rise < acked.length) return 0

    return this.markAll(acked, DEVICE_COMMAND_EVIDENCE.COUNTER_UP, input.now)
  }

  /** Verdadero si el contador de huellas subio respecto al snapshot del acuse. */
  private countersRose(command: DeviceCommand, counters: DeviceCounters): boolean {
    const snapshot = command.deviceCommandCountersSnapshot
    const before = snapshot?.fpCount ?? null
    if (before === null || counters.fpCount === null) return false
    return counters.fpCount > before
  }

  private async markAll(
    commands: DeviceCommand[],
    evidence: DeviceCommandEvidence,
    now: DateTime
  ): Promise<number> {
    let marked = 0
    for (const command of commands) {
      command.deviceCommandStatus = DEVICE_COMMAND_STATUS.EXECUTED
      command.deviceCommandExecutedAt = now
      command.deviceCommandExecutionEvidence = evidence
      await this.repository.save(command)
      marked += 1
    }
    return marked
  }
}
