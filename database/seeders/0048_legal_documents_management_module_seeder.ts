import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import RoleSystemPermission from '../../app/models/role_system_permission.js'

/**
 * Módulo/permisos de la gestión de documentos legales desde backoffice GSTI
 * (USRH1783364449581). A diferencia de otros seeders de módulo (p. ej.
 * 0045/0039, que asignan a `roleIds = [1, 2]` — super-administrador y
 * rh-manager, roles de administración de EMPRESA cliente), este módulo es de
 * **administración de plataforma**: se asigna únicamente a `roleId = 3`
 * (`root`), tal como exige la regla de negocio 1 ("ningún usuario de empresa
 * cliente accede a la pantalla ni a los endpoints, incluida la consulta del
 * histórico").
 *
 * La reserva real la impone `assertComplianceRepsePermission` en el
 * controller (403 para cualquier rol sin este permiso); este seeder solo
 * deja el rastro de auditoría/administración de roles — `root` ya pasa la
 * verificación por `roleSlug === 'root'` sin depender de estas filas.
 *
 * Deliberadamente NO se vincula a `system_setting_system_module`: esa tabla
 * asocia módulos a los ajustes (planes/features) de una unidad de negocio
 * cliente; este módulo es de plataforma, no de negocio.
 */
export default class extends BaseSeeder {
  private readonly moduleId = 46
  private readonly rootRoleId = 3
  private readonly permissions = [
    { systemPermissionId: 187, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionId: 188, systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionId: 189, systemPermissionName: 'Update', systemPermissionSlug: 'update' },
  ]

  async run() {
    await this.seedModule()
    await this.seedPermissions()
    await this.assignPermissionsToRoot()
  }

  private async seedModule() {
    await SystemModule.updateOrCreate(
      { systemModuleId: this.moduleId },
      {
        systemModuleName: 'Documentos legales',
        systemModuleSlug: 'legal-documents',
        systemModuleDescription:
          'Gestión y publicación de versiones del aviso de privacidad, términos y condiciones y consentimiento biométrico (administración de plataforma, reservado al rol root)',
        systemModules: '1',
        systemModulePath: '/legal-documents',
        systemModuleGroup: '4. Configuraciones',
        systemModuleActive: 1,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" /><path d="M9 9h1" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>',
        systemModuleUpdatedAt: DateTime.now(),
      }
    )
  }

  private async seedPermissions() {
    for (const permission of this.permissions) {
      await SystemPermission.updateOrCreate(
        { systemPermissionId: permission.systemPermissionId },
        { ...permission, systemModuleId: this.moduleId }
      )
    }
  }

  private async assignPermissionsToRoot() {
    for (const permission of this.permissions) {
      await RoleSystemPermission.firstOrCreate(
        { roleId: this.rootRoleId, systemPermissionId: permission.systemPermissionId },
        { roleId: this.rootRoleId, systemPermissionId: permission.systemPermissionId }
      )
    }
  }
}
