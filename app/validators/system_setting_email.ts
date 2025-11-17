import vine from '@vinejs/vine'

export const createSystemSettingNotificationEmailValidator = vine.compile(
  vine.object({
    systemSettingId: vine.number().min(1),
    email: vine.string().trim().minLength(1).maxLength(200).email(),
  })
)

export const updateSystemSettingNotificationEmailValidator = vine.compile(
  vine.object({
    systemSettingId: vine.number().min(1),
    email: vine.string().trim().minLength(1).maxLength(200).email(),
  })
)
