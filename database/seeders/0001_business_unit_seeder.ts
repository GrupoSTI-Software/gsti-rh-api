import BusinessUnit from '#models/business_unit'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'

/**
 * DATOS DE DESARROLLO. Siembra la empresa de ejemplo `GSTI RH` y por eso no corre en producción.
 *
 * Una instalación de producción no tiene empresas propias: los tenants nacen del
 * registro self-service o del alta desde configuración, cada uno con sus roles y
 * su configuración. `GSTI RH` y todo lo que cuelga de ella existen para poder
 * trabajar y correr la suite en local, no para ser el primer cliente.
 *
 * `root` sí se siembra siempre (`0008_user_seeder`): es la cuenta de plataforma
 * y alcanza todas las empresas activas sin necesitar membresía
 * (`BusinessAccessScopeService.getAccessibleIds`).
 */
export default class extends BaseSeeder {
  /** Fuera de producción: es dato de ejemplo, no plataforma. */
  static environment = ['development', 'test']

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
