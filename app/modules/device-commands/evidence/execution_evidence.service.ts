import type { DateTime } from 'luxon'
import DeviceCommandRepositoryMysql from '../device_command.repository.mysql.js'
import {
  ATTLOG_VERIFY_FACE,
  ATTLOG_VERIFY_FINGERPRINT,
  DEVICE_COMMAND_EVIDENCE,
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
  type DeviceCommandEvidence,
  type DeviceCommandKind,
} from '../device_command.constants.js'
import type { DeviceCommandRepository } from '../device_command.repository.js'
import type DeviceCommand from '#models/device_command'
import { BIO_TYPE } from '#modules/biometric-vault/biometric_vault.constants'

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
    /** Modalidad de lo que subio el equipo (`BIO_TYPE`). */
    bioType: number
    now: DateTime
  }): Promise<BiometricUploadEvidence> {
    /**
     * Solo una huella cierra un enrolamiento de huella.
     *
     * El equipo numera el rostro con el `No` que declare --el SenseFace sube
     * `No=0`-- asi que un rostro entrante coincidia en PIN y en numero con un
     * `ENROLL_FP` del dedo 0 pendiente y lo cerraba como ejecutado. El operador
     * leia "captura completada", la persona se iba, y en la boveda no habia una
     * sola huella. Es el mismo patron del acuse que se contaba como biometrico
     * presente.
     */
    if (input.bioType === BIO_TYPE.FACE) {
      /**
       * Un rostro que sube el equipo prueba la foto o la copia de rostro que se
       * le mando a ese PIN. No se devuelve quien lo pidio: la foto ya viaja a
       * los demas equipos por su cuenta, y esparcir ademas el template haria
       * dos copias del mismo rostro.
       */
      const faces = await this.faceWritesAwaiting(input.accessPointId, input.pin)
      const closed = await this.markAll(faces, DEVICE_COMMAND_EVIDENCE.BIOMETRIC_UPLOAD, input.now)
      return { closed, requestedByUserId: null }
    }
    if (input.bioType !== BIO_TYPE.FINGERPRINT) {
      return { closed: 0, requestedByUserId: null }
    }

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
    if (input.verify === ATTLOG_VERIFY_FACE) {
      const faces = await this.faceWritesAwaiting(input.accessPointId, input.pin)
      return this.markAll(faces, DEVICE_COMMAND_EVIDENCE.ATTLOG_VERIFY, input.now)
    }
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
    const fingerprints = await this.closeByRise({
      accessPointId: input.accessPointId,
      kinds: [DEVICE_COMMAND_KIND.ENROLL_FP, DEVICE_COMMAND_KIND.BIODATA_WRITE],
      belongs: (command) => !isFaceCommand(command),
      counter: 'fpCount',
      counters: input.counters,
      now: input.now,
    })
    /**
     * El rostro se mide con su propio contador. Una foto que reemplaza a otra
     * no lo mueve --el PIN ya tenia cara-- y por eso la prueba principal de la
     * foto es la descarga al acusar; esta cubre la primera vez.
     */
    const faces = await this.closeByRise({
      accessPointId: input.accessPointId,
      kinds: [DEVICE_COMMAND_KIND.BIOPHOTO_WRITE, DEVICE_COMMAND_KIND.BIODATA_WRITE],
      belongs: isFaceCommand,
      counter: 'faceCount',
      counters: input.counters,
      now: input.now,
    })
    return fingerprints + faces
  }

  /** Cierra lo que el alza de UN contador alcanza a explicar. */
  private async closeByRise(args: {
    accessPointId: number
    kinds: DeviceCommandKind[]
    belongs: (command: DeviceCommand) => boolean
    counter: 'fpCount' | 'faceCount'
    counters: DeviceCounters
    now: DateTime
  }): Promise<number> {
    const current = args.counters[args.counter]
    if (current === null) return 0

    const commands = await this.repository.findAwaitingEvidence({
      accessPointId: args.accessPointId,
      kinds: args.kinds,
    })
    const acked = commands.filter((command) => {
      if (!args.belongs(command)) return false
      if (command.deviceCommandStatus !== DEVICE_COMMAND_STATUS.ACKED) return false
      const before = command.deviceCommandCountersSnapshot?.[args.counter] ?? null
      return before !== null && current > before
    })
    if (acked.length === 0) return 0

    /**
     * El alza mas grande entre los pendientes: cada uno guarda su propio
     * snapshot, y el que acuso primero es el que mide el salto completo.
     */
    const rise = Math.max(
      ...acked.map(
        (command) => current - (command.deviceCommandCountersSnapshot?.[args.counter] ?? 0)
      )
    )
    if (rise < acked.length) return 0

    return this.markAll(acked, DEVICE_COMMAND_EVIDENCE.COUNTER_UP, args.now)
  }

  /** Fotos y copias de rostro esperando prueba para ese PIN en ese equipo. */
  private async faceWritesAwaiting(accessPointId: number, pin: string): Promise<DeviceCommand[]> {
    const commands = await this.repository.findAwaitingEvidence({
      accessPointId,
      kinds: [DEVICE_COMMAND_KIND.BIOPHOTO_WRITE, DEVICE_COMMAND_KIND.BIODATA_WRITE],
      pin,
    })
    return commands.filter(isFaceCommand)
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

/**
 * Verdadero si el comando escribe un rostro: la foto, o la copia de un template
 * `Type=9`. La modalidad de la copia solo viaja en la clave de correlacion
 * (`biodata:<pin>:<tipo>:<no>`), que es la que arma la replicacion.
 */
export function isFaceCommand(command: DeviceCommand): boolean {
  if (command.deviceCommandKind === DEVICE_COMMAND_KIND.BIOPHOTO_WRITE) return true
  if (command.deviceCommandKind !== DEVICE_COMMAND_KIND.BIODATA_WRITE) return false
  const key = command.deviceCommandCorrelationKey ?? ''
  return key.split(':')[2] === String(BIO_TYPE.FACE)
}
