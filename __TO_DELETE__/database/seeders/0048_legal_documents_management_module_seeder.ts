import { BaseSeeder } from '@adonisjs/lucid/seeders'
import RoleSystemPermission from '../../app/models/role_system_permission.js'
import { resolveSystemModuleGroupIds } from '../../app/helpers/system_module_group_seed_resolver.js'
import {
  resolveRoleIdsBySlug,
  upsertSystemModuleBySlug,
  upsertSystemPermissionsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Módulo/permisos de la gestión de documentos legales desde backoffice GSTI
 * (USRH1783364449581). A diferencia de otros seeders de módulo (p. ej.
 * 0045/0039, que asignan a los roles `super-administrador` y `rh-manager`,
 * roles de administración de EMPRESA cliente), este módulo es de
 * **administración de plataforma**: se asigna únicamente al rol `root`, tal
 * como exige la regla de negocio 1 ("ningún usuario de empresa cliente accede
 * a la pantalla ni a los endpoints, incluida la consulta del histórico").
 *
 * Identidad por slug, nunca por id: el módulo se resuelve por
 * `systemModuleSlug`, sus permisos por el par (módulo, slug) y el rol
 * destinatario por `roleSlug`. Declarar ids literales es lo que hacía que dos
 * seeders se pisaran en silencio y borró módulos del catálogo — este módulo
 * era uno de ellos (ver `app/helpers/system_catalog_seed_resolver.ts`).
 *
 * La reserva real la impone `assertComplianceRepsePermission` en el
 * controller (403 para cualquier rol sin este permiso); este seeder solo
 * deja el rastro de auditoría/administración de roles — `root` ya pasa la
 * verificación por `roleSlug === 'root'` sin depender de estas filas.
 *
 * Deliberadamente NO se vincula a `system_setting_system_module`: esa tabla
 * asocia módulos a los ajustes (planes/features) de una unidad de negocio
 * cliente; este módulo es de plataforma, no de negocio.
 *
 * Idempotente: identifica por slug y usa firstOrCreate en el pivote; se puede
 * re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0048_legal_documents_management_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara un id. */
  private readonly moduleSlug = 'legal-documents'

  /** Rol destinatario de los permisos, por slug estable. */
  private readonly roleSlugs = ['root']

  /** Permisos del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [
    { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
  ]

  async run() {
    const systemModuleId = await this.seedModule()
    const permissionIdBySlug = await this.seedPermissions(systemModuleId)
    await this.assignPermissionsToRoles(permissionIdBySlug)
  }

  private async seedModule(): Promise<number> {
    const groupIdByKey = await resolveSystemModuleGroupIds(['plataforma'], this.seederName)
    return upsertSystemModuleBySlug(
      {
        systemModuleName: 'Documentos legales',
        systemModuleSlug: this.moduleSlug,
        systemModuleDescription:
          'Gestión y publicación de versiones del aviso de privacidad, términos y condiciones y consentimiento biométrico (administración de plataforma, reservado al rol root)',
        systemModules: '1',
        systemModulePath: '/legal-documents',
        systemModuleActive: 1,
        systemModuleOrder: 10,
        systemModuleGroupId: groupIdByKey.get('plataforma') ?? null,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" /><path d="M9 9h1" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>',
      },
      this.seederName
    )
  }

  private async seedPermissions(systemModuleId: number): Promise<Map<string, number>> {
    return upsertSystemPermissionsBySlug(systemModuleId, this.permissions, this.seederName)
  }

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
