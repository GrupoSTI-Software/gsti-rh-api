import { BaseSeeder } from '@adonisjs/lucid/seeders'
import {
  resolveSystemModuleIdsBySlug,
  upsertSystemPermissionsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Registra el permiso `export-sensitive-data` en el módulo `compliance`.
 *
 * Controla si el usuario descarga el archivo con datos sensibles completos
 * (motivo + asiento) o con celdas enmascaradas (sin motivo ni asiento).
 * Es independiente de `reveal-sensitive-data` (revelado en pantalla), que
 * declara `0047_pii_sensitive_data_module_seeder` sobre el módulo `employees`.
 *
 * Identificación por slug, nunca por id:
 *  - El módulo lo declara `0017_system_module_seeder`; aquí solo se REFERENCIA,
 *    resolviéndolo por su slug `compliance`.
 *  - El permiso `export-sensitive-data` lo declara ESTE seeder: ningún otro lo
 *    siembra, y `app/services/pii_export_service.ts` lo consume por slug. Se da
 *    de alta por el par (módulo, slug), así que la BD asigna el id — elegir un
 *    número a mano es lo que borró módulos y permisos del catálogo (ver
 *    `app/helpers/system_catalog_seed_resolver.ts`).
 *
 * Solo registra el permiso en `system_permissions`; no asigna el permiso a ningún rol.
 * La asignación se realiza manualmente desde el BO de roles y permisos.
 *
 * Idempotente: el alta por slug actualiza la fila existente; se puede
 * re-ejecutar sin duplicar.
 *
 * Ref: USRH1783029947540 — Registrar acceso a datos sensibles en exportaciones masivas.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0048_export_sensitive_data_permission_seeder'

  /** Slug del módulo que se referencia; lo declara `0017_system_module_seeder`. */
  private readonly moduleSlug = 'compliance'

  /** Permiso del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [
    {
      systemPermissionName: 'Export sensitive data',
      systemPermissionSlug: 'export-sensitive-data',
    },
  ]

  async run() {
    const moduleIdBySlug = await resolveSystemModuleIdsBySlug([this.moduleSlug], this.seederName)
    const systemModuleId = moduleIdBySlug.get(this.moduleSlug)!

    await upsertSystemPermissionsBySlug(systemModuleId, this.permissions, this.seederName)
  }
}
