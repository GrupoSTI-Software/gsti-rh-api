import vine from '@vinejs/vine'

/** Igual que POST /api/employees-proceeding-files (employeeId + proceedingFileId) */
export const createSystemSettingProceedingFileValidator = vine.compile(
  vine.object({
    systemSettingId: vine.number().min(1),
    proceedingFileId: vine.number().min(1).optional(),
    proceedingFileIds: vine.array(vine.number().min(1)).minLength(1).optional(),
  })
)

export const updateSystemSettingProceedingFileValidator = vine.compile(
  vine.object({
    systemSettingId: vine.number().min(1),
    proceedingFileId: vine.number().min(1),
  })
)
