import { BaseSeeder } from '@adonisjs/lucid/seeders'
import {
  resolveSystemModuleIdsBySlug,
  upsertSystemPermissionsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Registra el permiso `reveal-sensitive-data` en el módulo de Empleados
 * (`employees`).
 *
 * No declara el módulo: `employees` lo declara `0017_system_module_seeder` y
 * aquí solo se referencia, resolviéndolo por slug. El permiso se identifica por
 * el par (módulo, slug) y su id lo asigna la BD; ningún id literal se escribe
 * —elegir números a mano es lo que borró módulos y permisos del catálogo (ver
 * `app/helpers/system_catalog_seed_resolver.ts`).
 *
 * Este seeder es el dueño del permiso: `0058_sensitive_read_grants_backfill_seeder`
 * falla ruidosamente si no lo encuentra, así que aquí se da de alta (no se
 * resuelve como referencia ajena).
 *
 * Solo registra el permiso en `system_permissions`; no crea módulo, no vincula
 * ajustes y no asigna el permiso a ningún rol. La asignación se realiza
 * manualmente desde el BO de roles y permisos.
 *
 * Idempotente: el alta por slug actualiza la fila existente; se puede
 * re-ejecutar sin duplicar.
 *
 * Ref: USRH1783019898097 — Enmascarar datos sensibles y registrar acceso al dato completo.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0047_pii_sensitive_data_module_seeder'

  /** Slug del módulo que se referencia; lo declara `0017_system_module_seeder`. */
  private readonly moduleSlug = 'employees'

  /** Permiso del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [
    {
      systemPermissionName: 'Reveal sensitive data',
      systemPermissionSlug: 'reveal-sensitive-data',
    },
  ]

  async run() {
    const moduleIdBySlug = await resolveSystemModuleIdsBySlug([this.moduleSlug], this.seederName)
    const systemModuleId = moduleIdBySlug.get(this.moduleSlug)!

    await upsertSystemPermissionsBySlug(systemModuleId, this.permissions, this.seederName)
  }
}
