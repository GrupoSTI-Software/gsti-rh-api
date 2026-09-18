import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemPermissionCatalogSyncService from '#services/system_permission_catalog_sync_service'

/**
 * Dispara la sincronización del índice maestro de módulos y permisos
 * (USRH1785766406720) hacia `system_permissions`.
 *
 * Delgado a propósito: toda la lógica vive en
 * `SystemPermissionCatalogSyncService`, reutilizada también por el comando
 * `permissions:check-consistency`. Este seeder solo la dispara en el flujo
 * estándar de instalación/actualización (`node ace db:seed`).
 *
 * Idempotente (regla 5): correrlo cuantas veces se quiera deja el mismo
 * resultado — no duplica, no falla en la segunda pasada y no revive nada
 * dado de baja a propósito. No escribe en `role_system_permissions` (regla
 * 8): esta entrega no concede ni retira ningún acceso.
 */
export default class extends BaseSeeder {
  async run() {
    await new SystemPermissionCatalogSyncService().sync()
  }
}
