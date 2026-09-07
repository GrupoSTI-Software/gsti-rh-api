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
  touchUnmappedPin(input: {
    accessPointId: number
    businessUnitId: number
    pin: string
    now: DateTime
  }): Promise<number>
}
