import BusinessUnit from '#models/business_unit'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    const businessUnits = [
      {
        businessUnitId: 1,
        businessUnitName: 'GSTI RH',
        businessUnitSlug: 'gsti-rh',
        businessUnitLegalName: 'GrupoSTI RH',
        businessUnitActive: 1,
      }
    ]

    for (const unit of businessUnits) {
      const { businessUnitId, ...unitData } = unit
      await BusinessUnit.firstOrCreate(
        { businessUnitId },
        {
          ...unitData,
          businessUnitCreatedAt: DateTime.now(),
          businessUnitUpdatedAt: DateTime.now(),
        }
      )
    }
  }
}
