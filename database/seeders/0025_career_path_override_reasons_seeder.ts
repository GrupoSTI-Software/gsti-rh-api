import { BaseSeeder } from '@adonisjs/lucid/seeders'
import CareerPathOverrideReason from '#models/career_path_override_reason'

export default class extends BaseSeeder {
  async run() {
    const careerPathOverrideReasons = [
      {
        careerPathOverrideReasonId: 1,
        careerPathOverrideReasonKey: 'saltar_escalones',
        careerPathOverrideReasonLabel: 'Saltar escalones',
        careerPathOverrideReasonActive: 1,
      },
      {
        careerPathOverrideReasonId: 2,
        careerPathOverrideReasonKey: 'cruzar_area',
        careerPathOverrideReasonLabel: 'Cruzar área',
        careerPathOverrideReasonActive: 1,
      },
      {
        careerPathOverrideReasonId: 3,
        careerPathOverrideReasonKey: 'cambio_especializacion',
        careerPathOverrideReasonLabel: 'Cambio de especialización',
        careerPathOverrideReasonActive: 1,
      },
      {
        careerPathOverrideReasonId: 4,
        careerPathOverrideReasonKey: 'otro',
        careerPathOverrideReasonLabel: 'Otro',
        careerPathOverrideReasonActive: 1,
      },
    ]

    for (const careerPathOverrideReason of careerPathOverrideReasons) {
      const { careerPathOverrideReasonId, ...careerPathOverrideReasonData } = careerPathOverrideReason
      await CareerPathOverrideReason.firstOrCreate({ careerPathOverrideReasonId }, careerPathOverrideReasonData)
    }
  }
}

