import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import { resolveSystemModuleGroupIds } from '../../app/helpers/system_module_group_seed_resolver.js'
import {
  resolveRoleIdsBySlug,
  upsertSystemModuleBySlug,
  upsertSystemPermissionsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Registra el módulo "Salidas de personal" (USRH1786568279581): la sección
 * del backoffice (`valanserh-bo/pages/employee-offboardings/`) que estrena la
 * configuración del catálogo de conceptos de salida; el listado de salidas
 * llega con USRH1786568279596 a la misma pantalla.
 *
 * Slug en PLURAL (`employee-offboardings`): `employee-offboarding` a secas ya
 * está tomado por un `system_feature` (`0032_system_feature_seeder.ts:44-50`).
 *
 * Siembra únicamente configuración de sistema, en 4 pasos (espejo de
 * `0053_regulatory_coverage_module_seeder.ts`):
 *  1. El módulo en `system_modules`, identificado por su slug. No declara id:
 *     elegir un número libre a mano es lo que borró cinco módulos del catálogo
 *     (ver `app/helpers/system_catalog_seed_resolver.ts`).
 *  2. Los 4 permisos read/create/update/delete, identificados por el par
 *     (módulo, slug), también sin id declarado.
 *  3. El vínculo del módulo con el system_setting activo (id 1). VESTIGIAL:
 *     nada lo lee en runtime — la disponibilidad real la gobierna
 *     `system_module_active` del paso 1. Se siembra por espejo del pivote
 *     mientras siga existiendo.
 *  4. La asignación de los 4 permisos a los roles super-administrador y
 *     rh-manager, resueltos por slug. `root` y `owner` NO se siembran: hacen
 *     bypass del catálogo en ambas capas (`app/services/role_service.ts:131-132`).
 *
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0055_employee_offboardings_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara un id. */
  private readonly moduleSlug = 'employee-offboardings'

  /** Id del system_setting activo al que se vincula el módulo (paso vestigial). */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos del módulo, por slug estable. */
  private readonly roleSlugs = ['super-administrador', 'rh-manager']

  /** Permisos del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [
    { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
  ]

  async run() {
    const systemModuleId = await this.seedModule()
    const permissionIdBySlug = await this.seedPermissions(systemModuleId)
    await this.linkModuleToActiveSetting(systemModuleId)
    await this.assignPermissionsToRoles(permissionIdBySlug)
  }

  /** 1. Alta del módulo en el catálogo. `systemModuleActive: 1` es el flag que realmente gatea menú y acceso. */
  private async seedModule(): Promise<number> {
    const groupIdByKey = await resolveSystemModuleGroupIds(['empresa'], this.seederName)
    return upsertSystemModuleBySlug(
      {
        systemModuleName: 'Salidas de personal',
        systemModuleSlug: this.moduleSlug,
        systemModuleDescription:
          'Configuración del catálogo de conceptos de salida por empresa: la lista contra la cual se revisa cada salida de personal (entrega de activos, finiquito, adeudos, documentos y accesos)',
        systemModules: '1',
        systemModulePath: '/employee-offboardings',
        systemModuleActive: 1,
        systemModuleOrder: 110,
        systemModuleGroupId: groupIdByKey.get('empresa') ?? null,
        systemModuleIcon: `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M13 12v.01" />
          <path d="M3 21h18" />
          <path d="M5 21v-16a2 2 0 0 1 2 -2h7.5m2.5 10.5v7.5" />
          <path d="M14 7h7m-3 -3l3 3l-3 3" />
        </svg>`,
      },
      this.seederName
    )
  }

  /** 2. Alta de los 4 permisos ligados al módulo. */
  private async seedPermissions(systemModuleId: number): Promise<Map<string, number>> {
    return upsertSystemPermissionsBySlug(systemModuleId, this.permissions, this.seederName)
  }

  /**
   * 3. Vínculo del módulo con el system_setting activo. VESTIGIAL: nada lo
   * lee en runtime (la disponibilidad real la gobierna `systemModuleActive`
   * del paso 1). Se mantiene por consistencia con el pivote mientras exista.
   */
  private async linkModuleToActiveSetting(systemModuleId: number) {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId },
      { systemSettingId: this.activeSettingId, systemModuleId }
    )
  }

  /** 4. Asignación de los 4 permisos a los roles indicados. */
  private async assignPermissionsToRoles(permissionIdBySlug: Map<string, number>) {
    const roleIdBySlug = await resolveRoleIdsBySlug(this.roleSlugs, this.seederName)

    for (const roleSlug of this.roleSlugs) {
      const roleId = roleIdBySlug.get(roleSlug)!
      for (const permission of this.permissions) {
        const systemPermissionId = permissionIdBySlug.get(permission.systemPermissionSlug)!
        await RoleSystemPermission.firstOrCreate(
          { roleId, systemPermissionId },
          { roleId, systemPermissionId }
        )
      }
    }
  }
}
