import vine from '@vinejs/vine'

export const createMedicalConditionTypeValidator = vine.compile(
  vine.object({
    medicalConditionTypeName: vine.string().trim().minLength(1).maxLength(100),
    medicalConditionTypeDescription: vine.string().trim().minLength(0).maxLength(500).optional(),
    medicalConditionTypeActive: vine.number().in([0, 1]).optional(),
  })
)

export const updateMedicalConditionTypeValidator = vine.compile(
  vine.object({
    medicalConditionTypeName: vine.string().trim().minLength(1).maxLength(100).optional(),
    medicalConditionTypeDescription: vine.string().trim().minLength(0).maxLength(500).optional(),
    medicalConditionTypeActive: vine.number().in([0, 1]).optional(),
  })
)
