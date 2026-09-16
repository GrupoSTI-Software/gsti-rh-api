import type { DateTime } from 'luxon'
import type { AdmsHeldPunchReason } from '#models/adms_held_punch'

export interface HeldPunchInput {
  accessPointId: number
  businessUnitId: number
  pin: string
  punchTimeLocal: DateTime
  punchTimeUtc: DateTime
  verify: number | null
  rawMessageId: number | null
  reason: AdmsHeldPunchReason
}

/**
 * Puerto de la retencion (spec v2, 9.4). `hold` es idempotente por la llave
 * (dispositivo, PIN, instante): el reenvio del equipo no multiplica la fila.
 */
export interface HeldPunchRepository {
  hold(input: HeldPunchInput): Promise<void>
  /** Alta o toque del PIN desconocido; devuelve su id para ligar la retencion. */
  /**
   * `name` y `bioType` son lo que el equipo sabe del PIN y el sistema no.
   * Sin ellos, el operador concilia mirando un numero pelado; con ellos ve a
   * quien dice el aparato que pertenece y que biometricos va a recuperar.
   */
  touchUnmappedPin(input: {
    accessPointId: number
    businessUnitId: number
    pin: string
    /** Nombre que el equipo declara para ese PIN. PII: se guarda cifrado. */
    name?: string | null
    /** Modalidad vista para ese PIN (1 huella, 9 rostro, 8 palma). */
    bioType?: number | null
    now: DateTime
  }): Promise<number>
}
