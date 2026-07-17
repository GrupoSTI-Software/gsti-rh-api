import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemPermission from '../../app/models/system_permission.js'

/**
 * Permiso nuevo `register-physical-consent` (USRH1784146205513), bajo el módulo
 * `employees` (id 1 — ya existente, ver `0017_system_module_seeder.ts`): NO se crea
 * módulo nuevo, la acción vive embebida en la ficha del empleado.
 *
 * Decisión Wilvardo 2026-07-15: permiso NUEVO y específico (se descarta reutilizar
 * `update-information`), asignable/revocable por rol desde la gestión de roles del BO
 * sin regalar la edición general de la ficha del empleado.
 *
 * `systemPermissionId: 194` — verificado contra la BD real el día de este desarrollo
 * (`SELECT MAX(system_permission_id) FROM system_permissions` = 193; el máximo
 * *reclamado* en archivos de seeders también es 193, en `0050_telework_policy_module_seeder.ts`).
 * H5 (deuda pre-existente, NO se toca aquí): hay colisión real de ids 187-189 entre
 * `0049_consent_evidence_permissions_seeder.ts`, `0048_legal_documents_management_module_seeder.ts`
 * y `0049_sensitive_data_access_log_module_seeder.ts` — confirmado también contra la BD
 * real (187/188 aparecen con datos mezclados de más de un seeder). Este permiso usa un
 * id posterior al máximo real, así que no agrava la colisión.
 *
 * Sin seed de `role_system_permissions`: `root` pasa por el atajo de
 * `RoleService.hasAccess` (nunca necesita la fila explícita); a roles de cliente se les
 * otorga desde la gestión de roles del BO. Idempotente: `updateOrCreate` por id.
 */
export default class extends BaseSeeder {
  private readonly permission = {
    systemPermissionId: 194,
    systemPermissionName: 'Register physical consent',
    systemPermissionSlug: 'register-physical-consent',
    systemModuleId: 1,
  }

  async run() {
    await SystemPermission.updateOrCreate(
      { systemPermissionId: this.permission.systemPermissionId },
      { ...this.permission }
    )
  }
}
