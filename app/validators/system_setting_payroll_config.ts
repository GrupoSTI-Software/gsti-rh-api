import vine from '@vinejs/vine'

export const createSystemSettingPayrollConfigValidator = vine.compile(
  vine.object({
    systemSettingPayrollConfigPaymentType: vine.string().trim(),
    systemSettingPayrollConfigFixedDay: vine.string().trim().optional(),
    systemSettingPayrollConfigFixedEveryNWeeks: vine.number().min(1).optional(),
    systemSettingPayrollConfigNumberOfDaysToBePaid: vine.number().min(1).optional(),
    systemSettingPayrollConfigNumberOfDaysEndToBePaid: vine.number().min(1).optional(),
    systemSettingPayrollConfigAdvanceDateInMonthsOf31Days: vine.boolean().optional(),
    systemSettingPayrollConfigAdvanceDateOnHolidays: vine.boolean().optional(),
    systemSettingPayrollConfigAdvanceDateOnWeekends: vine.boolean().optional(),
    systemSettingPayrollConfigNumberOfOverdueDaysToOffset: vine.number().optional(),
    systemSettingId: vine.number().min(1),
  })
)

export const updateSystemSettingPayrollConfigValidator = vine.compile(
  vine.object({
    systemSettingPayrollConfigPaymentType: vine.string().trim(),
    systemSettingPayrollConfigFixedDay: vine.string().trim().optional(),
    systemSettingPayrollConfigFixedEveryNWeeks: vine.number().min(1).optional(),
    systemSettingPayrollConfigNumberOfDaysToBePaid: vine.number().min(1).optional(),
    systemSettingPayrollConfigNumberOfDaysEndToBePaid: vine.number().min(1).optional(),
    systemSettingPayrollConfigAdvanceDateInMonthsOf31Days: vine.boolean().optional(),
    systemSettingPayrollConfigAdvanceDateOnHolidays: vine.boolean().optional(),
    systemSettingPayrollConfigAdvanceDateOnWeekends: vine.boolean().optional(),
    systemSettingPayrollConfigNumberOfOverdueDaysToOffset: vine.number().optional(),
    systemSettingId: vine.number().min(1),
  })
)
