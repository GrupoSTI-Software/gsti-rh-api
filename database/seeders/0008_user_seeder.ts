import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '../../app/models/user.js'
import BusinessUnit from '../../app/models/business_unit.js'

export default class extends BaseSeeder {
  async run() {
    const users = [
      {
        userEmail: 'desarrollo-software@gruposti.com',
        userId: 100,
        userPassword: 'GrupoSTI',
        userActive: 1,
        personId: 1,
        roleId: 3,
        businessUnitIds: [1],
      },
    ]

    for (const userData of users) {
      const { userEmail, businessUnitIds, ...rest } = userData
      const user = await User.firstOrCreate({ userEmail }, rest)

      // Asociación a unidades de negocio vía la pivote `business_unit_users`.
      // Se filtran únicamente IDs existentes y no soft-deleted, y se omiten los
      // que ya estén vinculados para mantener el seeder idempotente sin remover
      // asociaciones previas (no se usa `.sync()` para evitar efectos colaterales).
      const validBusinessUnits = await BusinessUnit.query()
        .whereIn('business_unit_id', businessUnitIds)
        .whereNull('business_unit_deleted_at')
        .select('business_unit_id')

      const validIds = validBusinessUnits.map((unit) => unit.businessUnitId)
      if (validIds.length === 0) continue

      const alreadyAttached = await user
        .related('businessUnits')
        .query()
        .whereIn('business_units.business_unit_id', validIds)
        .select('business_units.business_unit_id')

      const alreadyAttachedIds = alreadyAttached.map((unit) => unit.businessUnitId)
      const toAttach = validIds.filter((id) => !alreadyAttachedIds.includes(id))

      if (toAttach.length > 0) {
        await user.related('businessUnits').attach(toAttach)
      }
    }
  }
}
