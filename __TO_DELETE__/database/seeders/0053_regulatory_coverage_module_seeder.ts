import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { resolveSystemModuleGroupIds } from '../../app/helpers/system_module_group_seed_resolver.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import {
  resolveRoleIdsBySlug,
  upsertSystemModuleBySlug,
  upsertSystemPermissionsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Registra en el sistema el módulo "Cobertura regulatoria" (USRH1785246338065):
 * la pantalla que muestra, por cada norma mexicana cargada (NOM-035-STPS,
 * NOM-037-STPS), qué porcentaje de sus obligaciones cubre el producto y con
 * qué módulos (`valanserh-bo/pages/regulatory-coverage/`, 3 vistas: overview,
 * detalle por norma y vista ejecutiva).
 *
 * La pantalla ya existe y funciona (5 HUs previas del CAP-08-01-09), pero
 * nunca se registró en el catálogo `system_modules`. Sin fila en ese catálogo
 * el backoffice no la muestra en el menú y, además, el guard de acceso del
 * layout responde 403 a cualquier rol que no sea `root`/`owner` (los únicos
 * que hacen bypass del catálogo) — hoy es alcanzable solo con acceso total.
 * Esta HU no modifica la pantalla ni su comportamiento; solo la da de alta.
 *
 * Siembra únicamente configuración de sistema (no datos de negocio), en 4 pasos:
 *  1. El módulo en `system_modules`, identificado por su slug
 *     (`regulatory-coverage`). No declara id: elegir a mano un número "libre"
 *     es lo que borró cinco módulos del catálogo, porque dos seeders que
 *     reclamaban el mismo id se sobrescribían en silencio
 *     (ver `app/helpers/system_catalog_seed_resolver.ts`).
 *  2. Los 4 permisos read/create/update/delete, identificados por el par
 *     (módulo, slug), también sin id declarado: el id lo asigna la BD y el
 *     helper devuelve el mapa slug → id para el paso 4.
 *  3. El vínculo del módulo con el system_setting activo (id 1). **Vestigial**:
 *     verificado el 2026-07-28 que la tabla `system_setting_system_modules` y
 *     su modelo siguen existiendo, pero nada lo lee en runtime — la
 *     disponibilidad real la gobierna `system_module_active` (paso 1), tanto
 *     en cliente (`valanserh-bo/store/general.ts`) como en servidor
 *     (`app/services/role_service.ts`). Este paso se retira en cuanto la HU
 *     hermana `USRH1784573246787` complete el retiro del pivote.
 *  4. La asignación de los 4 permisos a los roles `super-administrador` y
 *     `rh-manager`, resueltos por slug. `root` y `owner` NO se siembran: ya
 *     hacen bypass del catálogo en ambas capas.
 *
 * Solo lectura: el módulo expone únicamente los 3 endpoints GET de
 * `start/routes/regulatory_coverage_routes.ts`. Los permisos `create`,
 * `update` y `delete` se siembran por consistencia con el resto del catálogo
 * (los demás módulos también tienen los 4), pero quedan inertes: no hay
 * endpoint de mutación ni chequeo de `hasAccess` que los consulte. El único
 * permiso con efecto funcional es `read`.
 *
 * El grupo de menú `'7. Plataforma'` ya existe con un único ocupante hasta
 * ahora (`consent-evidence`, root-only, "administración GSTI"). Cobertura
 * regulatoria sí la ve el cliente (`super-administrador` y `rh-manager`):
 * decisión de Wilvardo (2026-07-27) de que el grupo ensancha su semántica de
 * "administración GSTI" a "plataforma / transversal", porque la cobertura no
 * pertenece al bloque de ninguna norma en particular.
 *
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0053_regulatory_coverage_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara un id. */
  private readonly moduleSlug = 'regulatory-coverage'

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
        systemModuleName: 'Cobertura regulatoria',
        systemModuleSlug: this.moduleSlug,
        systemModuleDescription:
          'Consulta de solo lectura del nivel de cobertura del producto frente a las normas mexicanas vigentes (NOM-035, NOM-037): numerales evaluables, módulos que los cubren y vista ejecutiva',
        systemModules: '1',
        systemModulePath: '/regulatory-coverage',
        systemModuleActive: 1,
        systemModuleOrder: 140,
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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="m9 15 2 2 4-4" />
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
   * del paso 1). Se mantiene por consistencia con el pivote mientras siga
   * existiendo; se retira en cuanto `USRH1784573246787` complete el retiro.
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
