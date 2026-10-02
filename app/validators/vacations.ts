import VacationSetting from '#models/vacation_setting'
import vine from '@vinejs/vine'

export const createVacationSettingValidator = vine.compile(
  vine.object({
    vacationSettingYearsOfService: vine
      .number()
      .min(1)
      .max(50)
      .unique(async (_db, value, context) => {
        const existingSetting = await VacationSetting.query()
          .where('vacation_setting_years_of_service', value)
          .where('vacation_setting_apply_since', context.data.vacationSettingApplySince)
          .whereNull('vacation_setting_deleted_at')
          .first()

        if (existingSetting) {
          return false
        }
        return true
      }),
    // La escala de la reforma pasa de 30 días a los 31 años de servicio.
    vacationSettingVacationDays: vine.number().min(1).max(60),
    vacationSettingApplySince: vine.date(),
  })
)

export const updateVacationSettingValidator = vine.compile(
  vine.object({
    vacationSettingYearsOfService: vine
      .number()
      .min(1)
      .max(50)
      .unique(async (_db, value, context) => {
        const existingSetting = await VacationSetting.query()
          .whereNot('vacation_setting_id', context.data.vacationSettingId)
          .where('vacation_setting_years_of_service', value)
          .where('vacation_setting_apply_since', context.data.vacationSettingApplySince)
          .whereNull('vacation_setting_deleted_at')
          .first()

        if (existingSetting) {
          return false
        }
        return true
      }),
    // La escala de la reforma pasa de 30 días a los 31 años de servicio.
    vacationSettingVacationDays: vine.number().min(1).max(60),
    vacationSettingApplySince: vine.date(),
  })
)
