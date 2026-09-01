import vine from '@vinejs/vine'
import type { Infer } from '@vinejs/vine/types'

/**
 * Canales por los que puede declararse una checada. Vocabulario cerrado.
 *
 * TEMPORAL DE API-1: el catálogo definitivo (`ASSIST_CHANNEL`) y su código de
 * rechazo propio (`AST.VAL.009`) los aporta API-2 en `#constants/assist_origin`.
 * Hasta entonces el unitario ya acepta y valida el canal contra este literal, y
 * un valor fuera del vocabulario se rechaza con `AST.VAL.002`.
 */
export const ASSIST_INGESTION_CHANNELS = ['app', 'kiosk', 'backoffice', 'device'] as const
export type AssistIngestionChannel = (typeof ASSIST_INGESTION_CHANNELS)[number]

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
    assistChannel: vine.enum(ASSIST_INGESTION_CHANNELS).nullable().optional(),
  })
)

/** Cuerpo ya saneado del alta unitaria. */
export type StoreAssistPayload = Infer<typeof storeAssistValidator>

/**
 * Primer mensaje de un fallo de validación de Vine, para explicarle al cliente qué
 * campo no pasó sin filtrar la forma interna del error. `null` si el error no es de Vine.
 */
export function firstValidationMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const candidate = error as { code?: string; messages?: unknown }
  if (candidate.code !== 'E_VALIDATION_ERROR' || !Array.isArray(candidate.messages)) return null
  const [first] = candidate.messages as Array<{ message?: unknown }>
  return typeof first?.message === 'string' ? first.message : null
}
