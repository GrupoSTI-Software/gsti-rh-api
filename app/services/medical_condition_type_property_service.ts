import MedicalConditionTypeProperty from '#models/medical_condition_type_property'

export default class MedicalConditionTypePropertyService {
  async create(medicalConditionTypeProperty: MedicalConditionTypeProperty) {
    const newMedicalConditionTypeProperty = new MedicalConditionTypeProperty()
    newMedicalConditionTypeProperty.medicalConditionTypePropertyName = medicalConditionTypeProperty.medicalConditionTypePropertyName
    newMedicalConditionTypeProperty.medicalConditionTypePropertyDescription = medicalConditionTypeProperty.medicalConditionTypePropertyDescription
    newMedicalConditionTypeProperty.medicalConditionTypePropertyDataType = medicalConditionTypeProperty.medicalConditionTypePropertyDataType
    newMedicalConditionTypeProperty.medicalConditionTypePropertyRequired = medicalConditionTypeProperty.medicalConditionTypePropertyRequired
    newMedicalConditionTypeProperty.medicalConditionTypeId = medicalConditionTypeProperty.medicalConditionTypeId
    newMedicalConditionTypeProperty.medicalConditionTypePropertyActive = medicalConditionTypeProperty.medicalConditionTypePropertyActive
    await newMedicalConditionTypeProperty.save()

    await newMedicalConditionTypeProperty.load('medicalConditionType')
    return newMedicalConditionTypeProperty
  }

  async update(currentMedicalConditionTypeProperty: MedicalConditionTypeProperty, medicalConditionTypeProperty: MedicalConditionTypeProperty) {
    currentMedicalConditionTypeProperty.medicalConditionTypePropertyName = medicalConditionTypeProperty.medicalConditionTypePropertyName
    currentMedicalConditionTypeProperty.medicalConditionTypePropertyDescription = medicalConditionTypeProperty.medicalConditionTypePropertyDescription
    currentMedicalConditionTypeProperty.medicalConditionTypePropertyDataType = medicalConditionTypeProperty.medicalConditionTypePropertyDataType
    currentMedicalConditionTypeProperty.medicalConditionTypePropertyRequired = medicalConditionTypeProperty.medicalConditionTypePropertyRequired
    currentMedicalConditionTypeProperty.medicalConditionTypeId = medicalConditionTypeProperty.medicalConditionTypeId
    currentMedicalConditionTypeProperty.medicalConditionTypePropertyActive = medicalConditionTypeProperty.medicalConditionTypePropertyActive
    await currentMedicalConditionTypeProperty.save()
    return currentMedicalConditionTypeProperty
  }

  async delete(currentMedicalConditionTypeProperty: MedicalConditionTypeProperty) {
    await currentMedicalConditionTypeProperty.delete()
    return currentMedicalConditionTypeProperty
  }

  async show(medicalConditionTypePropertyId: number) {
    const medicalConditionTypeProperty = await MedicalConditionTypeProperty.query()
      .whereNull('medical_condition_type_property_deleted_at')
      .where('medical_condition_type_property_id', medicalConditionTypePropertyId)
      .preload('medicalConditionType')
      .first()
    return medicalConditionTypeProperty ? medicalConditionTypeProperty : null
  }

  async verifyInfo(medicalConditionTypeProperty: MedicalConditionTypeProperty) {
    return {
      status: 200,
      type: 'success',
      title: 'Info verify successfully',
      message: 'Info verify successfully',
      data: { ...medicalConditionTypeProperty },
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
