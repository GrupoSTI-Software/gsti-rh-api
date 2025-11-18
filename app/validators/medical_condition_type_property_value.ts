import vine from '@vinejs/vine'
import MedicalConditionTypeProperty from '#models/medical_condition_type_property'
import EmployeeMedicalCondition from '#models/employee_medical_condition'

export const createMedicalConditionTypePropertyValueValidator = vine.compile(
  vine.object({
    medicalConditionTypePropertyId: vine.number().exists(async (_db, value) => {
      const medicalConditionTypeProperty = await MedicalConditionTypeProperty.query()
        .whereNull('medical_condition_type_property_deleted_at')
        .where('medical_condition_type_property_id', value)
        .first()
      return !!medicalConditionTypeProperty
    }),
    employeeMedicalConditionId: vine.number().exists(async (_db, value) => {
      const employeeMedicalCondition = await EmployeeMedicalCondition.query()
        .whereNull('employee_medical_condition_deleted_at')
        .where('employee_medical_condition_id', value)
        .first()
      return !!employeeMedicalCondition
    }),
    medicalConditionTypePropertyValue: vine.string().trim().minLength(1).maxLength(500),
    medicalConditionTypePropertyValueActive: vine.number().in([0, 1]).optional(),
  })
)

export const updateMedicalConditionTypePropertyValueValidator = vine.compile(
  vine.object({
    medicalConditionTypePropertyId: vine.number().exists(async (_db, value) => {
      const medicalConditionTypeProperty = await MedicalConditionTypeProperty.query()
        .whereNull('medical_condition_type_property_deleted_at')
        .where('medical_condition_type_property_id', value)
        .first()
      return !!medicalConditionTypeProperty
    }).optional(),
    employeeMedicalConditionId: vine.number().exists(async (_db, value) => {
      const employeeMedicalCondition = await EmployeeMedicalCondition.query()
        .whereNull('employee_medical_condition_deleted_at')
        .where('employee_medical_condition_id', value)
        .first()
      return !!employeeMedicalCondition
    }).optional(),
    medicalConditionTypePropertyValue: vine.string().trim().minLength(1).maxLength(500).optional(),
    medicalConditionTypePropertyValueActive: vine.number().in([0, 1]).optional(),
  })
)
