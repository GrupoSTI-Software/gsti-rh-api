import vine from '@vinejs/vine'
import { PLATFORM_ACCEPTANCES_MAX_LIMIT } from '#modules/consent/platform/platform_consent.constants'

/**
 * Params de `GET /api/platform/tenants/:businessUnitPublicId/legal-acceptances`.
 *
 * `businessUnitPublicId` es el id público (UUID) de la ruta, nunca el id
 * numérico de la business unit. La ruta no valida los params por sí sola: el
 * controller debe invocar `request.validateUsing(…, { data: request.params() })`.
 */
export const platformTenantLegalAcceptancesParamsValidator = vine.compile(
  vine.object({
    businessUnitPublicId: vine.string().trim().uuid(),
  })
)

/**
 * Query params de `GET /api/platform/tenants/:businessUnitPublicId/legal-acceptances`.
 *
 * Solo paginación; cualquier otra llave (`reveal`, etc.) se ignora. `page` y
 * `perPage` usan `min(1)` y no `positive()`: en VineJS `positive()` admite el 0,
 * y CA-11 exige 422 con `page=0` (un offset negativo reventaría en 500), igual
 * que en `list_platform_legal_acceptances.validator.ts`.
 */
export const platformTenantLegalAcceptancesQueryValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).withoutDecimals().optional(),
    perPage: vine.number().min(1).withoutDecimals().max(PLATFORM_ACCEPTANCES_MAX_LIMIT).optional(),
  })
)

export type TenantHistoryParamsPayload = Awaited<
  ReturnType<typeof platformTenantLegalAcceptancesParamsValidator.validate>
>

export type TenantHistoryQueryPayload = Awaited<
  ReturnType<typeof platformTenantLegalAcceptancesQueryValidator.validate>
>
