import vine from '@vinejs/vine'

export const createProceedingFileTypePropertyValidator = vine.compile(
  vine.object({
    proceedingFileTypePropertyName: vine.string().trim().minLength(1).maxLength(100),
    proceedingFileTypePropertyType: vine.enum(['Text', 'File', 'Currency', 'Decimal', 'Number']),
    proceedingFileTypePropertyCategoryName: vine.string().trim().maxLength(100).optional(),
    proceedingFileTypeId: vine.number().positive(),
  })
)

export const updateProceedingFileTypePropertyValidator = vine.compile(
  vine.object({
    proceedingFileTypePropertyName: vine.string().trim().minLength(1).maxLength(100),
    proceedingFileTypePropertyType: vine.enum(['Text', 'File', 'Currency', 'Decimal', 'Number']),
    proceedingFileTypePropertyCategoryName: vine.string().trim().maxLength(100).optional(),
  })
)

export const createMultipleProceedingFileTypePropertiesValidator = vine.compile(
  vine.object({
    proceedingFileTypeId: vine.number().positive(),
    properties: vine.array(
      vine.object({
        proceedingFileTypePropertyName: vine.string().trim().minLength(1).maxLength(100),
        proceedingFileTypePropertyType: vine.enum(['Text', 'File', 'Currency', 'Decimal', 'Number']),
        proceedingFileTypePropertyCategoryName: vine.string().trim().maxLength(100).optional(),
      })
    ).minLength(1),
  })
)
