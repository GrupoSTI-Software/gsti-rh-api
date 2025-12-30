import vine from '@vinejs/vine'

export const createEmployeeZoneValidator = vine.compile(
  vine.object({
    employeeId: vine.number(),
    zoneId: vine.number()
  })
)

export const updateEmployeeZoneValidator = vine.compile(
  vine.object({
    employeeId: vine.number(),
    zoneId: vine.number()
  })
)
