import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemModuleGroup from '#models/system_module_group'
import { SYSTEM_MODULES_GROUPED } from '#constants/system_modules_menu/system_modules.constant'
import { buildSystemModuleGroupSeedValues } from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Siembra el catálogo de grupos del menú lateral, icono SVG incluido, desde
 * `system_modules.constant.ts` (USRH1788282413088). La migración
 * 1788282413065000 solo crea la tabla.
 *
 * Idempotencia garantizada (R8):
 *   — Usa withTrashed() para encontrar filas con baja lógica antes de crear
 *     una nueva; evita duplicados de clave cuando el UNIQUE vive sobre una
 *     columna generada que vale NULL en filas dadas de baja (CA2 / CA3).
 *   — Nunca toca system_module_group_deleted_at: un grupo retirado no revive
 *     por re-ejecutar este seeder (R9).
 *
 * Molde de idempotencia: `app/helpers/system_catalog_seed_resolver.ts`
 * (withTrashed, sin tocar deletedAt). Los valores salen de
 * `buildSystemModuleGroupSeedValues`, la misma función con la que
 * `permissions:check-consistency` compara la BD contra la constante.
 */
export default class extends BaseSeeder {
  async run() {
    for (const entry of SYSTEM_MODULES_GROUPED) {
      const values = buildSystemModuleGroupSeedValues(entry)
      // Viva primero y luego menor id: misma regla con la que la revisión de
      // consistencia elige la fila cuando hay una viva y otra dada de baja.
      const existing = await SystemModuleGroup.query()
        .withTrashed()
        .where('system_module_group_key', entry.key)
        .orderByRaw('system_module_group_deleted_at IS NULL DESC')
        .orderBy('system_module_group_id')
        .first()

      if (existing) {
        // Actualizar nombre, icono y orden sin tocar deletedAt:
        // un grupo dado de baja no debe revivir.
        existing.merge(values)
        await existing.save()
        continue
      }

      await SystemModuleGroup.create(values)
    }
  }
}
