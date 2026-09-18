import { BaseSeeder } from '@adonisjs/lucid/seeders'
import {
  resolveSystemModuleIdsBySlug,
  upsertSystemPermissionsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Permiso nuevo `register-physical-consent` (USRH1784146205513), bajo el módulo
 * `employees` (ya existente, lo declara `0017_system_module_seeder.ts`): NO se crea
 * módulo nuevo, la acción vive embebida en la ficha del empleado.
 *
 * Decisión Wilvardo 2026-07-15: permiso NUEVO y específico (se descarta reutilizar
 * `update-information`), asignable/revocable por rol desde la gestión de roles del BO
 * sin regalar la edición general de la ficha del empleado.
 *
 * Identificación por slug, nunca por id literal:
 *  - El módulo se RESUELVE por su slug (`resolveSystemModuleIdsBySlug`): este seeder
 *    solo lo referencia, no lo declara; si `employees` no existe, el resolver lanza
 *    nombrándolo en vez de colgar el permiso del módulo equivocado.
 *  - El permiso lo DECLARA este seeder (es su dueño: ningún otro lo siembra), así que
 *    se da de alta con `upsertSystemPermissionsBySlug`, identificado por el par
 *    (módulo, slug). El id lo asigna la BD.
 *
 * Elegir ids a mano es justo lo que hacía que dos seeders se pisaran en silencio vía
 * `updateOrCreate` por id (ver `app/helpers/system_catalog_seed_resolver.ts`).
 *
 * Sin seed de `role_system_permissions`: `root` pasa por el atajo de
 * `RoleService.hasAccess` (nunca necesita la fila explícita); a roles de cliente se les
 * otorga desde la gestión de roles del BO. Idempotente: el upsert por (módulo, slug)
 * permite re-ejecutar el seeder sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0051_physical_consent_permission_seeder'

  /** Módulo al que cuelga el permiso. Lo declara `0017_system_module_seeder`. */
  private readonly moduleSlug = 'employees'

  /** Permiso del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [
    {
      systemPermissionName: 'Register physical consent',
      systemPermissionSlug: 'register-physical-consent',
    },
  ]

  async run() {
    const moduleIdBySlug = await resolveSystemModuleIdsBySlug([this.moduleSlug], this.seederName)
    const systemModuleId = moduleIdBySlug.get(this.moduleSlug)!

    await upsertSystemPermissionsBySlug(systemModuleId, this.permissions, this.seederName)
  }
}
