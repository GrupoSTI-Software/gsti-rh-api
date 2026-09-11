import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import { resolveSystemModuleGroupIds } from '../../app/helpers/system_module_group_seed_resolver.js'
import {
  upsertSystemModuleBySlug,
  upsertSystemPermissionsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Registra en el sistema el módulo de "Bitácora de accesos a datos sensibles".
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules`, identificado por su slug
 *     (`sensitive-data-access-log`), para que aparezca en el menú del
 *     Backoffice. No declara id: elegir un número libre a mano es lo que borró
 *     cinco módulos del catálogo (ver `app/helpers/system_catalog_seed_resolver.ts`).
 *  2. El permiso `read`, identificado por el par (módulo, slug), también sin id
 *     declarado: el id lo asigna la BD.
 *  3. El vínculo del módulo con el system_setting activo (id 1).
 *
 * No asigna el permiso a ningún rol; la asignación se realiza manualmente
 * desde el BO de roles y permisos.
 *
 * Idempotente: la resolución por slug actualiza la fila existente o la crea;
 * el vínculo usa firstOrCreate. Se puede re-ejecutar sin duplicar.
 *
 * Ref: USRH1783029948545 — Consultar la bitácora de accesos a datos sensibles.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0049_sensitive_data_access_log_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara un id. */
  private readonly moduleSlug = 'sensitive-data-access-log'

  /** Id del system_setting activo al que se vincula el módulo. */
  private readonly activeSettingId = 1

  /** Permisos del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [{ systemPermissionName: 'Read', systemPermissionSlug: 'read' }]

  async run() {
    const systemModuleId = await this.seedModule()
    await this.seedPermissions(systemModuleId)
    await this.linkModuleToActiveSetting(systemModuleId)
  }

  /** 1. Alta del módulo en el catálogo, identificado por su slug. */
  private async seedModule(): Promise<number> {
    const groupIdByKey = await resolveSystemModuleGroupIds(['plataforma'], this.seederName)
    return upsertSystemModuleBySlug(
      {
        systemModuleName: 'Bitácora de accesos a datos sensibles',
        systemModuleSlug: this.moduleSlug,
        systemModuleDescription:
          'Consulta de solo lectura del historial de revelados individuales y exportaciones masivas con datos sensibles',
        systemModules: '1',
        systemModulePath: '/sensitive-data-access-log',
        systemModuleActive: 1,
        systemModuleOrder: 30,
        systemModuleGroupId: groupIdByKey.get('plataforma') ?? null,
        systemModuleIcon: `<svg
          xmlns='http://www.w3.org/2000/svg'
          width='48'
          height='48'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          stroke-width='2'
          stroke-linecap='round'
          stroke-linejoin='round'
        >
          <path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/>
          <polyline points='14 2 14 8 20 8'/>
          <line x1='16' y1='13' x2='8' y2='13'/>
          <line x1='16' y1='17' x2='8' y2='17'/>
          <polyline points='10 9 9 9 8 9'/>
        </svg>`,
      },
      this.seederName
    )
  }

  /** 2. Alta del permiso `read` ligado al módulo. */
  private async seedPermissions(systemModuleId: number): Promise<Map<string, number>> {
    return upsertSystemPermissionsBySlug(systemModuleId, this.permissions, this.seederName)
  }

  /** 3. Vínculo del módulo con el system_setting activo. */
  private async linkModuleToActiveSetting(systemModuleId: number) {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId },
      { systemSettingId: this.activeSettingId, systemModuleId }
    )
  }
}
