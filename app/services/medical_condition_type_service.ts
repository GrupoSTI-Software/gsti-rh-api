import MedicalConditionType from '#models/medical_condition_type'

export default class MedicalConditionTypeService {
  async create(medicalConditionType: MedicalConditionType) {
    const newMedicalConditionType = new MedicalConditionType()
    newMedicalConditionType.medicalConditionTypeName = medicalConditionType.medicalConditionTypeName
    newMedicalConditionType.medicalConditionTypeDescription = medicalConditionType.medicalConditionTypeDescription
    newMedicalConditionType.medicalConditionTypeActive = medicalConditionType.medicalConditionTypeActive
    await newMedicalConditionType.save()

    await newMedicalConditionType.load('properties')
    return newMedicalConditionType
  }

  async update(currentMedicalConditionType: MedicalConditionType, medicalConditionType: MedicalConditionType) {
    currentMedicalConditionType.medicalConditionTypeName = medicalConditionType.medicalConditionTypeName
    currentMedicalConditionType.medicalConditionTypeDescription = medicalConditionType.medicalConditionTypeDescription
    currentMedicalConditionType.medicalConditionTypeActive = medicalConditionType.medicalConditionTypeActive
    await currentMedicalConditionType.save()
    return currentMedicalConditionType
  }

  async delete(currentMedicalConditionType: MedicalConditionType) {
    await currentMedicalConditionType.delete()
    return currentMedicalConditionType
  }

  async show(medicalConditionTypeId: number) {
    const medicalConditionType = await MedicalConditionType.query()
      .whereNull('medical_condition_type_deleted_at')
      .where('medical_condition_type_id', medicalConditionTypeId)
      .preload('properties')
      .first()
    return medicalConditionType ? medicalConditionType : null
  }

  async verifyInfo(medicalConditionType: MedicalConditionType) {
    return {
      status: 200,
      type: 'success',
      title: 'Info verify successfully',
      message: 'Info verify successfully',
      data: { ...medicalConditionType },
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
