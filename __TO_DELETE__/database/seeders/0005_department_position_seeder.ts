import { BaseSeeder } from '@adonisjs/lucid/seeders'
import DepartmentPosition from '../../app/models/department_position.js'

/**
 * DATOS DE DESARROLLO. Siembra el cruce departamento-posición de la empresa de ejemplo y por eso no corre en producción.
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
    const departmentPositions = [
      {
        departmentId: 999,
        positionId: 999,
      },
    ]

    for (const departmentPosition of departmentPositions) {
      const { departmentId, ...departmentPositionData } = departmentPosition
      await DepartmentPosition.firstOrCreate({ departmentId }, departmentPositionData)
    }
  }
}
