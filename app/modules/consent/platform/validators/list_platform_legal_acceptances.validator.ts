import vine from '@vinejs/vine'
import {
  PLATFORM_ACCEPTANCE_STATUS_FILTERS,
  PLATFORM_ACCEPTANCES_MAX_LIMIT,
} from '#modules/consent/platform/platform_consent.constants'

/**
 * Query params de `GET /api/platform/legal-acceptances`.
 *
 * Mismo shape que `listTenantsValidator`; `status` filtra por estado de aceptación
 * (`al-dia | pendiente | nunca`). `sin-version-publicada` no es filtrable.
 *
 * `page` y `limit` usan `min(1)` y no `positive()`: en VineJS `positive()` admite el 0,
 * y CA-13 exige 422 con `page=0` (un offset negativo reventaría en 500).
 */
export const listPlatformLegalAcceptancesValidator = vine.compile(
  vine.object({
    search: vine.string().trim().minLength(1).maxLength(191).optional(),
    status: vine.enum(PLATFORM_ACCEPTANCE_STATUS_FILTERS).optional(),
    page: vine.number().min(1).withoutDecimals().optional(),
    limit: vine.number().min(1).withoutDecimals().max(PLATFORM_ACCEPTANCES_MAX_LIMIT).optional(),
  })
)
