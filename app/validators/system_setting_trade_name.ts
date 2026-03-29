import vine from '@vinejs/vine'

export const createSystemSettingTradeNameValidator = vine.compile(
  vine.object({
    systemSettingId: vine.number().min(1),
    systemSettingSidebarColor: vine.string().trim().minLength(1).maxLength(25),
    systemSettingTradeName: vine.string().trim().minLength(1).maxLength(150),
  })
)

export const updateSystemSettingTradeNameValidator = vine.compile(
  vine.object({
    systemSettingSidebarColor: vine.string().trim().minLength(1).maxLength(25),
    systemSettingTradeName: vine.string().trim().minLength(1).maxLength(150),
  })
)
