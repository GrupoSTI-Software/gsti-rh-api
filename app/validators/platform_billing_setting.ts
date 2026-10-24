import vine, { SimpleMessagesProvider } from '@vinejs/vine'
import { BILLING_GRACE_DAYS_MAX, BILLING_GRACE_DAYS_MIN } from '../helpers/contracted_employees_rules.js'

export const updatePlatformBillingSettingValidator = vine.compile(
  vine.object({
    graceDays: vine
      .number({ strict: true })
      .withoutDecimals()
      .min(BILLING_GRACE_DAYS_MIN)
      .max(BILLING_GRACE_DAYS_MAX),
    restrictionEnabled: vine.boolean({ strict: true }),
  })
)

export const listPlatformBillingSettingHistoryValidator = vine.compile(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    limit: vine.number().withoutDecimals().min(1).max(100).optional(),
  })
)

const GRACE_DAYS_MESSAGE = `Los días de gracia deben ser un número entero entre ${BILLING_GRACE_DAYS_MIN} y ${BILLING_GRACE_DAYS_MAX}.`
const RESTRICTION_MESSAGE = 'La activación de la restricción debe ser verdadero o falso.'

/** Explícitos en validateUsing: sin ellos el detail del 422 sale en inglés. */
export const platformBillingSettingValidatorMessages = new SimpleMessagesProvider({
  'graceDays.required': GRACE_DAYS_MESSAGE,
  'graceDays.number': GRACE_DAYS_MESSAGE,
  'graceDays.withoutDecimals': GRACE_DAYS_MESSAGE,
  'graceDays.min': GRACE_DAYS_MESSAGE,
  'graceDays.max': GRACE_DAYS_MESSAGE,
  'restrictionEnabled.required': RESTRICTION_MESSAGE,
  'restrictionEnabled.boolean': RESTRICTION_MESSAGE,
  'page.number': 'La página debe ser un número entero.',
  'page.withoutDecimals': 'La página debe ser un número entero.',
  'page.min': 'La página no puede ser menor a 1.',
  'limit.number': 'El límite de resultados por página debe ser un número entero.',
  'limit.withoutDecimals': 'El límite de resultados por página debe ser un número entero.',
  'limit.min': 'El límite de resultados por página no puede ser menor a 1.',
  'limit.max': 'El límite de resultados por página no puede ser mayor a 100.',
})