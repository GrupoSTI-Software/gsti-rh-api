import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Department from '#models/department'
import { DateTime } from 'luxon'

/**
 * DATOS DE DESARROLLO. Siembra los departamentos genéricos de la empresa de ejemplo y por eso no corre en producción.
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
    const departments = [
      {
        departmentId: 999,
        departmentSyncId: DateTime.now().toMillis(),
        departmentCode: 'SIN-DEPTO',
        departmentName: 'Sin Departamento',
        departmentAlias: 'Sin Departamento',
        departmentIsDefault: true,
        departmentActive: 1,
      },
      {
        departmentId: 1000,
        departmentSyncId: DateTime.now().toMillis(),
        departmentCode: DateTime.now().toMillis().toString(),
        departmentName: 'Dirección General',
        departmentAlias: 'Dirección General',
        departmentIsDefault: false,
        departmentActive: 1,
      }
    ]

    for (const department of departments) {
      const { departmentId, ...departmentData } = department
      await Department.firstOrCreate({ departmentId }, departmentData)
    }
  }
}
