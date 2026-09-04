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
