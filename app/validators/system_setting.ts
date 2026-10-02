import vine from '@vinejs/vine'

export const createSystemSettingValidator = vine.compile(
  vine.object({
    systemSettingSidebarColor: vine.string().trim().minLength(1).maxLength(25),
    systemSettingTradeName: vine.string().trim().minLength(1).maxLength(200),
    systemSettingMonthlyConversionFactor: vine.number().positive().max(31).optional(),
  })
)

export const updateSystemSettingValidator = vine.compile(
  vine.object({
    systemSettingSidebarColor: vine.string().trim().minLength(1).maxLength(25),
    systemSettingTradeName: vine.string().trim().minLength(1).maxLength(200),
    systemSettingMonthlyConversionFactor: vine.number().positive().max(31).optional(),
  })
)

/**
 * Cuerpo de `PUT /api/system-settings/:systemSettingId/site-timezone`.
 * La validez IANA la comprueba el servicio; aquí solo la forma.
 */
export const updateSiteTimezoneValidator = vine.compile(
  vine.object({
    businessUnitTimezone: vine.string().trim().minLength(1).maxLength(64),
  })
)
