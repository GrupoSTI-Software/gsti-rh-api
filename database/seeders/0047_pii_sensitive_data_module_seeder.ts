import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemPermission from '../../app/models/system_permission.js'

/**
 * Registra el permiso `reveal-sensitive-data` en el módulo de Empleados (id 1).
 *
 * Solo registra el permiso en `system_permissions`; no crea módulo, no vincula
 * ajustes y no asigna el permiso a ningún rol. La asignación se realiza
 * manualmente desde el BO de roles y permisos.
 *
 * Idempotente: usa updateOrCreate; se puede re-ejecutar sin duplicar.
 *
 * Ref: USRH1783019898097 — Enmascarar datos sensibles y registrar acceso al dato completo.
 */
export default class extends BaseSeeder {
  async run() {
    await SystemPermission.updateOrCreate(
      { systemPermissionId: 186 },
      {
        systemPermissionId: 186,
        systemPermissionName: 'Reveal sensitive data',
        systemPermissionSlug: 'reveal-sensitive-data',
        systemModuleId: 1,
      }
    )
  }
}
