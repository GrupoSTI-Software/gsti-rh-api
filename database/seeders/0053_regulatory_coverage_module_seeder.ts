import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemModuleGroup from '../../app/models/system_module_group.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'

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
 *  1. El módulo en `system_modules` (id 50, siguiente libre: el máximo en
 *     seeders era 49 en `0052_repse_providers_module_seeder.ts:33`, y el
 *     máximo en la BD real de este desarrollo era 33 — se usa el mayor de
 *     ambos + 1, tal como indica el propio precedente `0052:19-21`).
 *  2. Los 4 permisos read/create/update/delete (ids 202-205, siguientes
 *     libres tras el 201 de `0052_repse_providers_module_seeder.ts:43-46`).
 *  3. El vínculo del módulo con el system_setting activo (id 1). **Vestigial**:
 *     verificado el 2026-07-28 que la tabla `system_setting_system_modules` y
 *     su modelo siguen existiendo, pero nada lo lee en runtime — la
 *     disponibilidad real la gobierna `system_module_active` (paso 1), tanto
 *     en cliente (`valanserh-bo/store/general.ts`) como en servidor
 *     (`app/services/role_service.ts`). Este paso se retira en cuanto la HU
 *     hermana `USRH1784573246787` complete el retiro del pivote.
 *  4. La asignación de los 4 permisos a los roles super-administrador (1) y
 *     rh-manager (2). `root` y `owner` NO se siembran: ya hacen bypass del
 *     catálogo en ambas capas.
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
 * regulatoria sí la ve el cliente (roles 1 y 2): decisión de Wilvardo
 * (2026-07-27) de que el grupo ensancha su semántica de "administración
 * GSTI" a "plataforma / transversal", porque la cobertura no pertenece al
 * bloque de ninguna norma en particular.
 *
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Id del módulo (siguiente libre tras el 49 de repse-providers). */
  private readonly moduleId = 50

  /** Id del system_setting activo al que se vincula el módulo (paso vestigial). */
  private readonly activeSettingId = 1

  /** Roles que reciben los permisos del módulo (super-administrador y rh-manager). */
  private readonly roleIds = [1, 2]

  /** Permisos del módulo con sus ids fijos (siguientes libres tras el 201). */
  private readonly permissions = [
    { systemPermissionId: 202, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 203, systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionId: 204, systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionId: 205, systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
  ]

  async run() {
    await this.seedModule()
    await this.seedPermissions()
    await this.linkModuleToActiveSetting()
    await this.assignPermissionsToRoles()
  }

  /** 1. Alta del módulo en el catálogo. `systemModuleActive: 1` es el flag que realmente gatea menú y acceso. */
  private async seedModule() {
    const plataformaGroup = await SystemModuleGroup.findBy(
      'system_module_group_key',
      'plataforma'
    )
    await SystemModule.updateOrCreate(
      { systemModuleId: this.moduleId },
      {
        systemModuleName: 'Cobertura regulatoria',
        systemModuleSlug: 'regulatory-coverage',
        systemModuleDescription:
          'Consulta de solo lectura del nivel de cobertura del producto frente a las normas mexicanas vigentes (NOM-035, NOM-037): numerales evaluables, módulos que los cubren y vista ejecutiva',
        systemModules: '1',
        systemModulePath: '/regulatory-coverage',
        systemModuleGroupId: plataformaGroup?.systemModuleGroupId ?? null,
        systemModuleActive: 1,
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
        systemModuleUpdatedAt: DateTime.now(),
      }
    )
  }

  /** 2. Alta de los 4 permisos ligados al módulo. */
  private async seedPermissions() {
    for (const permission of this.permissions) {
      await SystemPermission.updateOrCreate(
        { systemPermissionId: permission.systemPermissionId },
        { ...permission, systemModuleId: this.moduleId }
      )
    }
  }

  /**
   * 3. Vínculo del módulo con el system_setting activo. VESTIGIAL: nada lo
   * lee en runtime (la disponibilidad real la gobierna `systemModuleActive`
   * del paso 1). Se mantiene por consistencia con el pivote mientras siga
   * existiendo; se retira en cuanto `USRH1784573246787` complete el retiro.
   */
  private async linkModuleToActiveSetting() {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId: this.moduleId },
      { systemSettingId: this.activeSettingId, systemModuleId: this.moduleId }
    )
  }

  /** 4. Asignación de los 4 permisos a los roles indicados. */
  private async assignPermissionsToRoles() {
    for (const roleId of this.roleIds) {
      for (const permission of this.permissions) {
        await RoleSystemPermission.firstOrCreate(
          { roleId, systemPermissionId: permission.systemPermissionId },
          { roleId, systemPermissionId: permission.systemPermissionId }
        )
      }
    }
  }
}
