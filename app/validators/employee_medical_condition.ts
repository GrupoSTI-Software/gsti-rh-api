import vine from '@vinejs/vine'
import Employee from '#models/employee'
import MedicalConditionType from '#models/medical_condition_type'

export const createEmployeeMedicalConditionValidator = vine.compile(
  vine.object({
    employeeId: vine.number().exists(async (_db, value) => {
      const employee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', value)
        .first()
      return !!employee
    }),
    medicalConditionTypeId: vine.number().exists(async (_db, value) => {
      const medicalConditionType = await MedicalConditionType.query()
        .whereNull('medical_condition_type_deleted_at')
        .where('medical_condition_type_id', value)
        .first()
      return !!medicalConditionType
    }),
    employeeMedicalConditionDiagnosis: vine.string().trim().minLength(1).maxLength(500),
    employeeMedicalConditionTreatment: vine.string().trim().minLength(0).maxLength(500).optional(),
    employeeMedicalConditionNotes: vine.string().trim().minLength(0).maxLength(1000).optional(),
    employeeMedicalConditionActive: vine.number().in([0, 1]).optional(),
    propertyValues: vine.array(
      vine.object({
        medicalConditionTypePropertyId: vine.number(),
        medicalConditionTypePropertyValue: vine.string().trim().minLength(1).maxLength(500),
        medicalConditionTypePropertyValueActive: vine.number().in([0, 1]).optional(),
      })
    ).optional(),
  })
)

export const updateEmployeeMedicalConditionValidator = vine.compile(
  vine.object({
    employeeId: vine.number().exists(async (_db, value) => {
      const employee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', value)
        .first()
      return !!employee
    }).optional(),
    medicalConditionTypeId: vine.number().exists(async (_db, value) => {
      const medicalConditionType = await MedicalConditionType.query()
        .whereNull('medical_condition_type_deleted_at')
        .where('medical_condition_type_id', value)
        .first()
      return !!medicalConditionType
    }).optional(),
    employeeMedicalConditionDiagnosis: vine.string().trim().minLength(1).maxLength(500).optional(),
    employeeMedicalConditionTreatment: vine.string().trim().minLength(0).maxLength(500).optional(),
    employeeMedicalConditionNotes: vine.string().trim().minLength(0).maxLength(1000).optional(),
    employeeMedicalConditionActive: vine.number().in([0, 1]).optional(),
    propertyValues: vine.array(
      vine.object({
        medicalConditionTypePropertyId: vine.number(),
        medicalConditionTypePropertyValue: vine.string().trim().minLength(1).maxLength(500),
        medicalConditionTypePropertyValueActive: vine.number().in([0, 1]).optional(),
      })
    ).optional(),
  })
)
