import vine, { SimpleMessagesProvider } from '@vinejs/vine'

/**
 * Query params de `GET /api/platform/metrics/receivables`.
 *
 * Sin filtros de tramo ni de tenant en esta rebanada: la franja lee el resumen
 * completo y la tabla por tenant (USRH1788055613531) pagina sobre el mismo
 * orden fijo.
 *
 * Usa `.min(1)` en lugar del `.positive()` del molde
 * (`platform_tenant.ts:28-29`) porque `positive` no admite un mensaje con la
 * cota y el `detail` del 422 está fijado por el criterio de aceptación.
 */
export const listReceivablesValidator = vine.compile(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    limit: vine.number().withoutDecimals().min(1).max(100).optional(),
  })
)

/**
 * Mensajes en español de `listReceivablesValidator`.
 *
 * El controlador los pasa explícitos en `request.validateUsing`: el provider
 * global de i18n solo se aplica cuando la llamada no trae el suyo
 * (`@adonisjs/core` → `request_validator.js:51-53`), y como el repo no tiene
 * traducciones de validator, sin esto el `detail` del 422 saldría en inglés.
 */
export const receivablesValidatorMessages = new SimpleMessagesProvider({
  'page.number': 'La página debe ser un número entero.',
  'page.withoutDecimals': 'La página debe ser un número entero.',
  'page.min': 'La página no puede ser menor a 1.',
  'limit.number': 'El límite de resultados por página debe ser un número entero.',
  'limit.withoutDecimals': 'El límite de resultados por página debe ser un número entero.',
  'limit.min': 'El límite de resultados por página no puede ser menor a 1.',
  'limit.max': 'El límite de resultados por página no puede ser mayor a 100.',
})

/**
 * Query params de `GET /api/platform/metrics/mrr-series`.
 *
 * `meses` es el ancho de la ventana. Opcional a propósito: el 12 por omisión lo
 * aplica el controlador, como en la cartera, para que el default viva en un solo
 * lugar en vez de duplicarse entre el validador y quien lo consume.
 */
export const mrrSeriesValidator = vine.compile(
  vine.object({
    meses: vine.number().withoutDecimals().min(1).max(24).optional(),
  })
)

/**
 * Mensajes en español de `mrrSeriesValidator`.
 *
 * Las cuatro reglas dicen la misma frase porque el `detail` del 422 está fijado
 * por el criterio de aceptación: no puede cambiar según cuál regla de Vine falló
 * primero. Van explícitos por el mismo motivo que los de la cartera — el provider
 * global de i18n solo se aplica cuando la llamada no trae el suyo, y sin esto el
 * mensaje saldría en inglés.
 */
export const mrrSeriesValidatorMessages = new SimpleMessagesProvider({
  'meses.number': 'El número de meses debe estar entre 1 y 24.',
  'meses.withoutDecimals': 'El número de meses debe estar entre 1 y 24.',
  'meses.min': 'El número de meses debe estar entre 1 y 24.',
  'meses.max': 'El número de meses debe estar entre 1 y 24.',
})

/**
 * Query params de `GET /api/platform/metrics/subscription-flows`.
 *
 * `mes` es opcional: ausente significa el mes en curso. El rechazo de meses
 * futuros vive en el servicio (depende del día de hoy); aquí solo se fija la
 * forma `YYYY-MM`.
 */
export const subscriptionFlowsValidator = vine.compile(
  vine.object({
    mes: vine.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  })
)

/**
 * Mensajes en español de `subscriptionFlowsValidator`.
 *
 * Van explícitos porque el provider global de i18n solo se aplica cuando la
 * llamada no trae el suyo, y sin esto el `detail` del 422 saldría en inglés.
 */
export const subscriptionFlowsValidatorMessages = new SimpleMessagesProvider({
  'mes.string': 'El mes debe tener el formato AAAA-MM.',
  'mes.regex': 'El mes debe tener el formato AAAA-MM.',
})
