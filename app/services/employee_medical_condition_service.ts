import EmployeeMedicalCondition from '#models/employee_medical_condition'
import MedicalConditionTypePropertyValue from '#models/medical_condition_type_property_value'

export default class EmployeeMedicalConditionService {
  async create(employeeMedicalCondition: EmployeeMedicalCondition, propertyValues?: any[]) {
    const newEmployeeMedicalCondition = new EmployeeMedicalCondition()
    newEmployeeMedicalCondition.employeeId = employeeMedicalCondition.employeeId
    newEmployeeMedicalCondition.medicalConditionTypeId = employeeMedicalCondition.medicalConditionTypeId
    newEmployeeMedicalCondition.employeeMedicalConditionDiagnosis = employeeMedicalCondition.employeeMedicalConditionDiagnosis
    newEmployeeMedicalCondition.employeeMedicalConditionTreatment = employeeMedicalCondition.employeeMedicalConditionTreatment
    newEmployeeMedicalCondition.employeeMedicalConditionNotes = employeeMedicalCondition.employeeMedicalConditionNotes
    newEmployeeMedicalCondition.employeeMedicalConditionActive = employeeMedicalCondition.employeeMedicalConditionActive
    await newEmployeeMedicalCondition.save()

    // Crear los valores de las propiedades si se proporcionan
    if (propertyValues && propertyValues.length > 0) {
      for (const propertyValue of propertyValues) {
        const newPropertyValue = new MedicalConditionTypePropertyValue()
        newPropertyValue.medicalConditionTypePropertyId = propertyValue.medicalConditionTypePropertyId
        newPropertyValue.employeeMedicalConditionId = newEmployeeMedicalCondition.employeeMedicalConditionId
        newPropertyValue.medicalConditionTypePropertyValue = propertyValue.medicalConditionTypePropertyValue
        newPropertyValue.medicalConditionTypePropertyValueActive = propertyValue.medicalConditionTypePropertyValueActive || 1
        await newPropertyValue.save()
      }
    }

    await newEmployeeMedicalCondition.load('employee')
    await newEmployeeMedicalCondition.load('medicalConditionType')
    await newEmployeeMedicalCondition.load('propertyValues', (query) => {
      query.preload('medicalConditionTypeProperty')
    })
    return newEmployeeMedicalCondition
  }

  async update(currentEmployeeMedicalCondition: EmployeeMedicalCondition, employeeMedicalCondition: EmployeeMedicalCondition, propertyValues?: any[]) {
    currentEmployeeMedicalCondition.employeeId = employeeMedicalCondition.employeeId
    currentEmployeeMedicalCondition.medicalConditionTypeId = employeeMedicalCondition.medicalConditionTypeId
    currentEmployeeMedicalCondition.employeeMedicalConditionDiagnosis = employeeMedicalCondition.employeeMedicalConditionDiagnosis
    currentEmployeeMedicalCondition.employeeMedicalConditionTreatment = employeeMedicalCondition.employeeMedicalConditionTreatment
    currentEmployeeMedicalCondition.employeeMedicalConditionNotes = employeeMedicalCondition.employeeMedicalConditionNotes
    currentEmployeeMedicalCondition.employeeMedicalConditionActive = employeeMedicalCondition.employeeMedicalConditionActive
    await currentEmployeeMedicalCondition.save()

    // Actualizar los valores de las propiedades si se proporcionan
    if (propertyValues && propertyValues.length > 0) {
      // Eliminar valores existentes
      await MedicalConditionTypePropertyValue.query()
        .where('employee_medical_condition_id', currentEmployeeMedicalCondition.employeeMedicalConditionId)
        .delete()

      // Crear nuevos valores
      for (const propertyValue of propertyValues) {
        const newPropertyValue = new MedicalConditionTypePropertyValue()
        newPropertyValue.medicalConditionTypePropertyId = propertyValue.medicalConditionTypePropertyId
        newPropertyValue.employeeMedicalConditionId = currentEmployeeMedicalCondition.employeeMedicalConditionId
        newPropertyValue.medicalConditionTypePropertyValue = propertyValue.medicalConditionTypePropertyValue
        newPropertyValue.medicalConditionTypePropertyValueActive = propertyValue.medicalConditionTypePropertyValueActive || 1
        await newPropertyValue.save()
      }
    }

    return currentEmployeeMedicalCondition
  }

  async delete(currentEmployeeMedicalCondition: EmployeeMedicalCondition) {
    // Eliminar valores de propiedades relacionados
    await MedicalConditionTypePropertyValue.query()
      .where('employee_medical_condition_id', currentEmployeeMedicalCondition.employeeMedicalConditionId)
      .delete()

    await currentEmployeeMedicalCondition.delete()
    return currentEmployeeMedicalCondition
  }

  async show(employeeMedicalConditionId: number) {
    const employeeMedicalCondition = await EmployeeMedicalCondition.query()
      .whereNull('employee_medical_condition_deleted_at')
      .where('employee_medical_condition_id', employeeMedicalConditionId)
      .preload('employee', (query) => {
        query.preload('person')
      })
      .preload('medicalConditionType', (query) => {
        query.preload('properties')
      })
      .preload('propertyValues', (query) => {
        query.preload('medicalConditionTypeProperty')
      })
      .first()
    return employeeMedicalCondition ? employeeMedicalCondition : null
  }

  async verifyInfo(employeeMedicalCondition: EmployeeMedicalCondition) {
    return {
      status: 200,
      type: 'success',
      title: 'Info verify successfully',
      message: 'Info verify successfully',
      data: { ...employeeMedicalCondition },
    }
  }

  sanitizeInput(input: { [key: string]: string | null }) {
    for (let key in input) {
      if (input[key] === 'null' || input[key] === 'undefined') {
        input[key] = null
      }
    }
    return input
  }
}
