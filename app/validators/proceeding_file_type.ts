import vine from '@vinejs/vine'

export const createProceedingFileTypeValidator = vine.compile(
  vine.object({
    proceedingFileTypeName: vine.string().trim().minLength(1).maxLength(100),
    proceedingFileTypeSlug: vine.string().trim().minLength(1).maxLength(250),
    proceedingFileTypeAreaToUse: vine.string().trim().minLength(1).maxLength(100),
    proceedingFileTypeActive: vine.boolean().optional(),
  })
)

export const updateProceedingFileTypeValidator = vine.compile(
  vine.object({
    proceedingFileTypeName: vine.string().trim().minLength(1).maxLength(100),
    proceedingFileTypeSlug: vine.string().trim().minLength(1).maxLength(250),
    proceedingFileTypeAreaToUse: vine.string().trim().minLength(1).maxLength(100),
    proceedingFileTypeActive: vine.boolean().optional(),
  })
)

export const createEmployeeProceedingFileTypeValidator = vine.compile(
  vine.object({
    proceedingFileTypeName: vine.string().trim().minLength(1).maxLength(100),
    parentId: vine.number().optional(),
    proceedingFileTypeActive: vine.boolean().optional(),
    proceedingFileTypeIsExclusive: vine.boolean().optional(),
    employeeId: vine.number().optional(),
  })
)
