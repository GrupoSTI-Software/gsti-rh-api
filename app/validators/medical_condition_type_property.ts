import vine from '@vinejs/vine'
import MedicalConditionType from '#models/medical_condition_type'

export const createMedicalConditionTypePropertyValidator = vine.compile(
  vine.object({
    medicalConditionTypePropertyName: vine.string().trim().minLength(1).maxLength(100),
    medicalConditionTypePropertyDescription: vine.string().trim().minLength(0).maxLength(500).optional(),
    medicalConditionTypePropertyDataType: vine.string().trim().minLength(1).maxLength(50),
    medicalConditionTypePropertyRequired: vine.number().in([0, 1]).optional(),
    medicalConditionTypeId: vine.number().exists(async (_db, value) => {
      const medicalConditionType = await MedicalConditionType.query()
        .whereNull('medical_condition_type_deleted_at')
        .where('medical_condition_type_id', value)
        .first()
      return !!medicalConditionType
    }),
    medicalConditionTypePropertyActive: vine.number().in([0, 1]).optional(),
  })
)

export const updateMedicalConditionTypePropertyValidator = vine.compile(
  vine.object({
    medicalConditionTypePropertyName: vine.string().trim().minLength(1).maxLength(100).optional(),
    medicalConditionTypePropertyDescription: vine.string().trim().minLength(0).maxLength(500).optional(),
    medicalConditionTypePropertyDataType: vine.string().trim().minLength(1).maxLength(50).optional(),
    medicalConditionTypePropertyRequired: vine.number().in([0, 1]).optional(),
    medicalConditionTypeId: vine.number().exists(async (_db, value) => {
      const medicalConditionType = await MedicalConditionType.query()
        .whereNull('medical_condition_type_deleted_at')
        .where('medical_condition_type_id', value)
        .first()
      return !!medicalConditionType
    }).optional(),
    medicalConditionTypePropertyActive: vine.number().in([0, 1]).optional(),
  })
)
