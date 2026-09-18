import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Position from '../../app/models/position.js'
import { DateTime } from 'luxon'

/**
 * DATOS DE DESARROLLO. Siembra la posición "Sin posición" de la empresa de ejemplo y por eso no corre en producción.
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
    const positions = [
      {
        positionId: 999,
        position_sync_id: DateTime.now().toMillis(),
        positionCode: 'SIN-POS',
        positionName: 'Sin posición',
        positionAlias: 'Sin posición',
        positionIsDefault: true,
        positionActive: 1,
        companyId: 1,
        businessUnitId: 1
      },
    ]

    for (const position of positions) {
      const { positionId, ...positionData } = position
      await Position.firstOrCreate({ positionId }, positionData)
    }
  }
}
