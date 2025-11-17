import MedicalConditionTypePropertyValue from '#models/medical_condition_type_property_value'

export default class MedicalConditionTypePropertyValueService {
  async create(medicalConditionTypePropertyValue: MedicalConditionTypePropertyValue) {
    const newMedicalConditionTypePropertyValue = new MedicalConditionTypePropertyValue()
    newMedicalConditionTypePropertyValue.medicalConditionTypePropertyId = medicalConditionTypePropertyValue.medicalConditionTypePropertyId
    newMedicalConditionTypePropertyValue.employeeMedicalConditionId = medicalConditionTypePropertyValue.employeeMedicalConditionId
    newMedicalConditionTypePropertyValue.medicalConditionTypePropertyValue = medicalConditionTypePropertyValue.medicalConditionTypePropertyValue
    newMedicalConditionTypePropertyValue.medicalConditionTypePropertyValueActive = medicalConditionTypePropertyValue.medicalConditionTypePropertyValueActive
    await newMedicalConditionTypePropertyValue.save()

    await newMedicalConditionTypePropertyValue.load('medicalConditionTypeProperty')
    await newMedicalConditionTypePropertyValue.load('employeeMedicalCondition')
    return newMedicalConditionTypePropertyValue
  }

  async update(currentMedicalConditionTypePropertyValue: MedicalConditionTypePropertyValue, medicalConditionTypePropertyValue: MedicalConditionTypePropertyValue) {
    currentMedicalConditionTypePropertyValue.medicalConditionTypePropertyId = medicalConditionTypePropertyValue.medicalConditionTypePropertyId
    currentMedicalConditionTypePropertyValue.employeeMedicalConditionId = medicalConditionTypePropertyValue.employeeMedicalConditionId
    currentMedicalConditionTypePropertyValue.medicalConditionTypePropertyValue = medicalConditionTypePropertyValue.medicalConditionTypePropertyValue
    currentMedicalConditionTypePropertyValue.medicalConditionTypePropertyValueActive = medicalConditionTypePropertyValue.medicalConditionTypePropertyValueActive
    await currentMedicalConditionTypePropertyValue.save()
    return currentMedicalConditionTypePropertyValue
  }

  async delete(currentMedicalConditionTypePropertyValue: MedicalConditionTypePropertyValue) {
    await currentMedicalConditionTypePropertyValue.delete()
    return currentMedicalConditionTypePropertyValue
  }

  async show(medicalConditionTypePropertyValueId: number) {
    const medicalConditionTypePropertyValue = await MedicalConditionTypePropertyValue.query()
      .whereNull('medical_condition_type_property_value_deleted_at')
      .where('medical_condition_type_property_value_id', medicalConditionTypePropertyValueId)
      .preload('medicalConditionTypeProperty')
      .preload('employeeMedicalCondition')
      .first()
    return medicalConditionTypePropertyValue ? medicalConditionTypePropertyValue : null
  }

  async verifyInfo(medicalConditionTypePropertyValue: MedicalConditionTypePropertyValue) {
    return {
      status: 200,
      type: 'success',
      title: 'Info verify successfully',
      message: 'Info verify successfully',
      data: { ...medicalConditionTypePropertyValue },
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
