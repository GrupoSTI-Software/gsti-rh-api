import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemPermission from '../../app/models/system_permission.js'

/**
 * Registra el permiso `export-sensitive-data` en el módulo de Cumplimiento (id 42).
 *
 * Controla si el usuario descarga el archivo con datos sensibles completos
 * (motivo + asiento) o con celdas enmascaradas (sin motivo ni asiento).
 * Es independiente de `reveal-sensitive-data` (revelado en pantalla).
 *
 * Solo registra el permiso en `system_permissions`; no asigna el permiso a ningún rol.
 * La asignación se realiza manualmente desde el BO de roles y permisos.
 *
 * Idempotente: usa updateOrCreate; se puede re-ejecutar sin duplicar.
 *
 * Ref: USRH1783029947540 — Registrar acceso a datos sensibles en exportaciones masivas.
 */
export default class extends BaseSeeder {
  async run() {
    await SystemPermission.updateOrCreate(
      { systemPermissionId: 187 },
      {
        systemPermissionId: 187,
        systemPermissionName: 'Export sensitive data',
        systemPermissionSlug: 'export-sensitive-data',
        systemModuleId: 42,
      }
    )
  }
}
