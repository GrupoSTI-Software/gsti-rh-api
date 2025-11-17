import SystemSetting from '#models/system_setting'
import vine from '@vinejs/vine'

export const createSystemSettingEmployeeValidator = vine.compile(
    vine.object({
        systemSettingId: vine.number().exists(async (_db, value) => {
            const existingSystemSetting = await SystemSetting.query().where('systemSettingId', value).first()
            return !!existingSystemSetting
        }),
        employeeLimit: vine.number().optional(),
    })
)