import vine from '@vinejs/vine'
import type { Infer } from '@vinejs/vine/types'
import { ASSIST_CHANNEL_VALUES } from '#constants/assist_origin'
import { ASSIST_INGESTION_BATCH_MAX_ITEMS } from '../assist_ingestion.constants.js'

/**
 * Decimal opcional del marcaje, con la misma normalización del alta unitaria.
 */
function optionalDecimal() {
  return vine
    .number()
    .parse((value) => (value === '' ? null : value))
    .nullable()
    .optional()
}

/**
 * Lista blanca de **un elemento** de la entrega.
 *
 * Se valida elemento por elemento y no como parte del sobre a propósito: un
 * elemento mal formado es un veredicto suyo, no un motivo para tirar la entrega
 * completa — que es justo lo que vuelve viable vaciar una cola con un defecto dentro.
 *
 * `assistPunchTime` es opcional en esta rebanada; quien lo vuelve obligatorio y le
 * aplica la ventana de captura es USRH1788135907803, sobre este mismo validador.
 */
export const assistBatchItemValidator = vine.compile(
  vine.object({
    clientRef: vine.string().trim().maxLength(64).nullable().optional(),
    employeeId: vine.number().withoutDecimals().positive(),
    assistType: vine.string().trim().maxLength(50).nullable().optional(),
    assistPunchTime: vine.string().trim().maxLength(40).nullable().optional(),
    assistLatitude: optionalDecimal(),
    assistLongitude: optionalDecimal(),
    assistPrecision: optionalDecimal(),
    assistChannel: vine.enum(ASSIST_CHANNEL_VALUES).nullable().optional(),
  })
)

/** Un elemento ya saneado de la entrega. */
export type AssistBatchItemPayload = Infer<typeof assistBatchItemValidator>

/** Motivos por los que un sobre se rechaza completo. */
export type AssistBatchEnvelopeProblem = 'missing' | 'not-an-array' | 'empty' | 'too-many' | 'too-large'

export interface AssistBatchEnvelope {
  items: unknown[]
}

/**
 * Juzga el sobre de la entrega. Es lo único que puede detener el lote entero:
 * sin lista de checadas, con la lista vacía, por encima del tope de elementos o
 * por encima del tamaño máximo del mensaje.
 *
 * @param assists valor crudo del campo `assists` del cuerpo
 * @param contentLength cabecera `Content-Length` de la petición, si vino
 */
export function inspectAssistBatchEnvelope(
  assists: unknown,
  contentLength: number | null,
  maxBodyBytes: number
): AssistBatchEnvelopeProblem | null {
  if (contentLength !== null && contentLength > maxBodyBytes) return 'too-large'
  if (assists === undefined || assists === null) return 'missing'
  if (!Array.isArray(assists)) return 'not-an-array'
  if (assists.length === 0) return 'empty'
  if (assists.length > ASSIST_INGESTION_BATCH_MAX_ITEMS) return 'too-many'
  return null
}
