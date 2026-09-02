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
