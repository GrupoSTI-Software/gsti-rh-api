import vine from '@vinejs/vine'

export const createProceedingFileTypePropertyValueValidator = vine.compile(
  vine.object({
    proceedingFileTypePropertyId: vine.number().min(1),
    employeeId: vine.number().min(1).optional(),
    proceedingFileId: vine.number().min(1),
    proceedingFileTypePropertyValueValue: vine.string().trim().minLength(1).optional(),
    proceedingFileTypePropertyValueActive: vine.boolean(),
  })
)

export const updateProceedingFileTypePropertyValueValidator = vine.compile(
  vine.object({
    proceedingFileTypePropertyValueValue: vine.string().trim().minLength(1).optional(),
    proceedingFileTypePropertyValueActive: vine.boolean(),
  })
)
