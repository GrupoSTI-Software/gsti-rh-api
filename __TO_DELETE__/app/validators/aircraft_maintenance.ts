import vine from '@vinejs/vine'

export const createAircraftMaintenanceValidator = vine.compile(
  vine.object({
    aircraftId: vine.number().min(1), // Ejemplo simple
    maintenanceTypeId: vine.number().min(1),
    maintenanceUrgencyLevelId: vine.number().min(1),
    aircraftMaintenanceStatusId: vine.number().min(1),
  })
)
