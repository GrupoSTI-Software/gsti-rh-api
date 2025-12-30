import InsuranceCoverageType from '#models/insurance_coverage_type'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    const dateTime = DateTime.now()

    const coverageTypes = [
      {
        insuranceCoverageTypeId: 1,
        insuranceCoverageTypeName: 'Riesgo de trabajo',
        insuranceCoverageTypeDescription: 'riesgo de trabajo',
        insuranceCoverageTypeSlug: 'riesgo-de-trabajo',
        insuranceCoverageTypeActive: 1,
      },
      {
        insuranceCoverageTypeId: 2,
        insuranceCoverageTypeName: 'Enfermedad general',
        insuranceCoverageTypeDescription: 'enfermedad general',
        insuranceCoverageTypeSlug: 'enfermedad-general',
        insuranceCoverageTypeActive: 1,
      },
      {
        insuranceCoverageTypeId: 3,
        insuranceCoverageTypeName: 'Maternidad',
        insuranceCoverageTypeDescription: 'maternidad',
        insuranceCoverageTypeSlug: 'maternidad',
        insuranceCoverageTypeActive: 1,
      },
      {
        insuranceCoverageTypeId: 4,
        insuranceCoverageTypeName: 'Riesgo de trayecto',
        insuranceCoverageTypeDescription: 'riesgo de trayecto',
        insuranceCoverageTypeSlug: 'riesgo-de-trayecto',
        insuranceCoverageTypeActive: 1,
      },
      {
        insuranceCoverageTypeId: 5,
        insuranceCoverageTypeName: 'Incapacidad interna',
        insuranceCoverageTypeDescription: 'Incapacidad interna',
        insuranceCoverageTypeSlug: 'incapacidad-interna',
        insuranceCoverageTypeActive: 1,
      },
    ]

    for (const coverageType of coverageTypes) {
      const { insuranceCoverageTypeId, ...coverageTypeData } = coverageType
      await InsuranceCoverageType.firstOrCreate(
        { insuranceCoverageTypeId },
        {
          ...coverageTypeData,
          insuranceCoverageTypeCreatedAt: dateTime,
          insuranceCoverageTypeUpdatedAt: dateTime,
        }
      )
    }
  }
}
