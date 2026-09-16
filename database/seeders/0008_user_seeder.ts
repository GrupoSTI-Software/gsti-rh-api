import { BaseSeeder } from '@adonisjs/lucid/seeders'
import env from '#start/env'
import User from '../../app/models/user.js'
import BusinessUnit from '../../app/models/business_unit.js'
import { resolveRoleIdsBySlug } from '../../app/helpers/system_catalog_seed_resolver.js'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  /** Rol del usuario de plataforma, por slug: el id depende del orden de siembra. */
  private readonly roleSlug = 'root'

  async run() {
    const rootUserEmail = env.get('ROOT_USER_EMAIL')
    const rootUserPassword = env.get('ROOT_USER_PASSWORD')

    if (!rootUserEmail || !rootUserPassword) {
      throw new Error(
        '[0008_user_seeder] Faltan ROOT_USER_EMAIL y/o ROOT_USER_PASSWORD en el .env. ' +
          'Sin ellas el usuario root se sembraría sin credenciales.'
      )
    }

    const roleIdBySlug = await resolveRoleIdsBySlug([this.roleSlug], '0008_user_seeder')

    const users = [
      {
        userEmail: rootUserEmail,
        userId: 1,
        userPassword: rootUserPassword,
        userActive: 1,
        personId: 1,
        roleId: roleIdBySlug.get(this.roleSlug)!,
        businessUnitIds: [1],
        isPlatformAdmin: true,
        userPasswordSetAt: DateTime.now(),
        userEmailVerifiedAt: DateTime.now(),
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
