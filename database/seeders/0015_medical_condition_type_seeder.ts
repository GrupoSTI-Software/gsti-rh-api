import { BaseSeeder } from '@adonisjs/lucid/seeders'
import MedicalConditionType from '../../app/models/medical_condition_type.js'

export default class extends BaseSeeder {
  async run() {
    const medicalConditionTypes = [
      {
        medicalConditionTypeId: 1,
        medicalConditionTypeName: 'Tipo de sangre',
        medicalConditionTypeDescription: 'Tipo de sangre',
        medicalConditionTypeActive: 1
      }
    ]

    for (const medicalConditionType of medicalConditionTypes) {
      const { medicalConditionTypeId, ...medicalConditionTypeData } = medicalConditionType
      await MedicalConditionType.firstOrCreate({ medicalConditionTypeId }, medicalConditionTypeData)
    }
  }
}
