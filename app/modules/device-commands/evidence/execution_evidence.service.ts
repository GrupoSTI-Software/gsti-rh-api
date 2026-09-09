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
  }): Promise<number> {
    const commands = await this.repository.findAwaitingEvidence({
      accessPointId: input.accessPointId,
      kinds: [DEVICE_COMMAND_KIND.ENROLL_FP],
      pin: input.pin,
      bioNo: input.bioNo,
    })
    return this.markAll(commands, DEVICE_COMMAND_EVIDENCE.BIOMETRIC_UPLOAD, input.now)
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
   * acusar. Es la prueba mas debil de las tres -- no dice de quien es la huella
   * -- asi que solo se aplica cuando queda UN enrolamiento vivo: con dos
   * abiertos no se sabe cual de los dos subio el contador.
   */
  async fromCounters(input: {
    accessPointId: number
    counters: DeviceCounters
    now: DateTime
  }): Promise<number> {
    if (input.counters.fpCount === null) return 0

    const commands = await this.repository.findAwaitingEvidence({
      accessPointId: input.accessPointId,
      kinds: [DEVICE_COMMAND_KIND.ENROLL_FP],
    })
    const acked = commands.filter(
      (command) =>
        command.deviceCommandStatus === DEVICE_COMMAND_STATUS.ACKED &&
        this.countersRose(command, input.counters)
    )
    if (acked.length !== 1) return 0

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
