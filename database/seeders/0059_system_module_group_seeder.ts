import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemModuleGroup from '#models/system_module_group'
import { SYSTEM_MODULE_GROUP_CATALOG } from '#constants/system_module_group_catalog'

/**
 * Siembra el catálogo de grupos del menú lateral y llena el icono SVG que
 * la migración 1788282413065000 dejó vacío (USRH1788282413088).
 *
 * Idempotencia garantizada (R8):
 *   — Usa withTrashed() para encontrar filas con baja lógica antes de crear
 *     una nueva; evita duplicados de clave cuando el UNIQUE vive sobre una
 *     columna generada que vale NULL en filas dadas de baja (CA2 / CA3).
 *   — Nunca toca system_module_group_deleted_at: un grupo retirado no revive
 *     por re-ejecutar este seeder (R9).
 *
 * Molde: database/seeders/0017_system_module_seeder.ts:841-857.
 */
export default class extends BaseSeeder {
  async run() {
    for (const entry of SYSTEM_MODULE_GROUP_CATALOG) {
      const existing = await SystemModuleGroup.query()
        .withTrashed()
        .where('system_module_group_key', entry.key)
        .first()

      if (existing) {
        // Actualizar nombre, icono y orden sin tocar deletedAt:
        // un grupo dado de baja no debe revivir (CA3).
        existing.merge({
          systemModuleGroupName: entry.name,
          systemModuleGroupOrder: entry.order,
          systemModuleGroupIcon: entry.icon,
        })
        await existing.save()
        continue
      }

      await SystemModuleGroup.create({
        systemModuleGroupName: entry.name,
        systemModuleGroupKey: entry.key,
        systemModuleGroupOrder: entry.order,
        systemModuleGroupIcon: entry.icon,
      })
    }
  }
}
