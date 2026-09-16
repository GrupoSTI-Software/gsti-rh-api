import vine from '@vinejs/vine'

export const createMaintenanceExpenseValidator = vine.compile(
  vine.object({
    aircraftMaintenanceId: vine.number().min(1),
    maintenanceExpenseCategoryId: vine.number().min(1),
    maintenanceExpenseAmount: vine.number().min(1),
    maintenanceExpenseTrackingNumber: vine.string(),
    maintenanceExpenseInternalFolio: vine.string(),
  })
)
