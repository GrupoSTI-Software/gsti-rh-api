import vine from '@vinejs/vine'
import type { Infer } from '@vinejs/vine/types'
import { ASSIST_CHANNEL_VALUES } from '#constants/assist_origin'

/**
 * Decimal opcional del marcaje. El Backoffice manda cadena vacía en las coordenadas
 * (`AssistModel` las inicializa en `''`), así que se normaliza a `null` antes de validar.
 */
function optionalDecimal() {
  return vine
    .number()
    .parse((value) => (value === '' ? null : value))
    .nullable()
    .optional()
}

/**
 * Lista blanca del alta unitaria de checada (`POST /api/v1/assists`).
 *
 * El cliente sólo declara el hecho: a quién, cuándo, de qué tipo, dónde y por qué
 * canal. Todo campo de pertenencia o de rastro —`businessUnitId`, `assistOrigin`,
 * `assistCreatedByUserId`, `assistNaturalKey`, `assistCreatedAt`, `assistTerminalSn`…—
 * queda fuera del esquema y Vine lo descarta: lo deriva el servidor.
 *
 * `assistType` se declara opcional a propósito: el Backoffice no lo manda hoy
 * (`AssistInterface` no lo declara), y exigirlo rompería la captura administrativa viva.
 */
export const storeAssistValidator = vine.compile(
  vine.object({
    employeeId: vine.number().withoutDecimals().positive(),
    assistType: vine.string().trim().maxLength(50).nullable().optional(),
    assistPunchTime: vine.string().trim().maxLength(40).nullable().optional(),
    assistLatitude: optionalDecimal(),
    assistLongitude: optionalDecimal(),
    assistPrecision: optionalDecimal(),
    assistChannel: vine.enum(ASSIST_CHANNEL_VALUES).nullable().optional(),
  })
)

/** Cuerpo ya saneado del alta unitaria. */
export type StoreAssistPayload = Infer<typeof storeAssistValidator>

/** Campo y mensaje del primer fallo de validación de Vine. */
export interface StoreAssistValidationIssue {
  field: string
  message: string
}

/**
 * Primer fallo de validación de Vine, para explicarle al cliente qué campo no pasó
 * sin filtrar la forma interna del error. `null` si el error no es de Vine.
 */
export function firstValidationIssue(error: unknown): StoreAssistValidationIssue | null {
  if (typeof error !== 'object' || error === null) return null
  const candidate = error as { code?: string; messages?: unknown }
  if (candidate.code !== 'E_VALIDATION_ERROR' || !Array.isArray(candidate.messages)) return null
  const [first] = candidate.messages as Array<{ field?: unknown; message?: unknown }>
  if (typeof first?.message !== 'string') return null
  return {
    field: typeof first.field === 'string' ? first.field : '',
    message: first.message,
  }
}
