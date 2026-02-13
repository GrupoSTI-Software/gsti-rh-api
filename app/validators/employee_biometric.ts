import vine from '@vinejs/vine'

export const createEmployeeBiometricValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive(),
    fingers: vine.array(vine.number().min(0).max(9)).optional(),
    face: vine.boolean().optional(),
  })
)

export const updateEmployeeBiometricValidator = vine.compile(
  vine.object({
    fingers: vine.array(vine.number().min(0).max(9)).optional(),
    face: vine.boolean().optional(),
  })
)
