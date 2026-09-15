import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemModuleGroup from '#models/system_module_group'
import { SYSTEM_MODULES } from '#constants/system_modules_menu/system_modules.constant'
import {
  retireSystemModule,
  upsertSystemModuleBySlug,
  upsertSystemPermissionsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Siembra `system_modules` y `system_permissions` desde
 * `app/constants/system_modules_menu/system_modules.constant.ts`, la fuente
 * única del catálogo.
 *
 * Cada módulo se identifica por su slug y cada permiso por el par (módulo,
 * slug): ninguna entrada declara id, el id lo asigna la BD. La razón está
 * documentada en `app/helpers/system_catalog_seed_resolver.ts`.
 *
 * Idempotente: re-ejecutarlo actualiza lo existente sin duplicar filas. Un
 * módulo marcado `systemModuleRetired` se da de baja lógica y uno ya dado de
 * baja nunca revive.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores de los resolvers digan quién falló. */
  private readonly seederName = 'system_module_seeder'

  async run() {
    const groupKeys = [
      ...new Set(
        SYSTEM_MODULES.map((systemModule) => systemModule.systemModuleGroupKey).filter(
          (key): key is NonNullable<typeof key> => key !== null
        )
      ),
    ]

    const groups = await SystemModuleGroup.query()
      .whereIn('system_module_group_key', groupKeys)
      .whereNull('system_module_group_deleted_at')

    const groupIdByKey = new Map<string, number>(
      groups.map((group) => [group.systemModuleGroupKey, group.systemModuleGroupId])
    )

    const missingKeys = groupKeys.filter((key) => !groupIdByKey.has(key))

    if (missingKeys.length > 0) {
      throw new Error(
        `[${this.seederName}] Grupo(s) no encontrado(s) por clave: ${missingKeys.sort().join(', ')}. ` +
          'Verifica que 0061_system_module_group_seeder haya corrido antes.'
      )
    }

    for (const systemModule of SYSTEM_MODULES) {
      const systemModuleId = await upsertSystemModuleBySlug(
        {
          systemModuleName: systemModule.systemModuleName,
          systemModuleSlug: systemModule.systemModuleSlug,
          systemModuleDescription: systemModule.systemModuleDescription,
          systemModules: String(systemModule.systemModules),
          systemModulePath: systemModule.systemModulePath,
          systemModuleActive: systemModule.systemModuleActive,
          systemModuleOrder: systemModule.systemModuleOrder,
          systemModuleGroupId: systemModule.systemModuleGroupKey
            ? groupIdByKey.get(systemModule.systemModuleGroupKey) ?? null
            : null,
          systemModulePermissionEnforcementActive:
            systemModule.systemModulePermissionEnforcementActive,
          systemModuleIcon: systemModule.systemModuleIcon,
        },
        this.seederName
      )

      await upsertSystemPermissionsBySlug(
        systemModuleId,
        [...systemModule.systemModulePermissions],
        this.seederName
      )

      if (systemModule.systemModuleRetired) {
        await retireSystemModule(systemModuleId)
      }
    }
  }
}
