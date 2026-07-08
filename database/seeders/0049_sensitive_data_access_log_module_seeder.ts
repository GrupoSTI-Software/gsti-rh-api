import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import SystemModule from '../../app/models/system_module.js'
import SystemPermission from '../../app/models/system_permission.js'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'

/**
 * Registra en el sistema el módulo de "Bitácora de accesos a datos sensibles".
 *
 * Siembra únicamente configuración de sistema (no datos de negocio):
 *  1. El módulo en `system_modules` (id 46) para que aparezca en el menú del Backoffice.
 *  2. El permiso `read` (id 188) ligado al módulo.
 *  3. El vínculo del módulo con el system_setting activo (id 1).
 *
 * No asigna el permiso a ningún rol; la asignación se realiza manualmente
 * desde el BO de roles y permisos.
 *
 * Idempotente: usa updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 *
 * Ref: USRH1783029948545 — Consultar la bitácora de accesos a datos sensibles.
 */
export default class extends BaseSeeder {
  private readonly moduleId = 46
  private readonly activeSettingId = 1

  private readonly permissions = [
    { systemPermissionId: 188, systemPermissionName: 'Read', systemPermissionSlug: 'read' },
  ]

  async run() {
    await this.seedModule()
    await this.seedPermissions()
    await this.linkModuleToActiveSetting()
  }

  private async seedModule() {
    await SystemModule.updateOrCreate(
      { systemModuleId: this.moduleId },
      {
        systemModuleName: 'Bitácora de accesos a datos sensibles',
        systemModuleSlug: 'sensitive-data-access-log',
        systemModuleDescription:
          'Consulta de solo lectura del historial de revelados individuales y exportaciones masivas con datos sensibles',
        systemModules: '1',
        systemModulePath: '/sensitive-data-access-log',
        systemModuleGroup: '5. NOM-035',
        systemModuleActive: 1,
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

  private async linkModuleToActiveSetting() {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId: this.moduleId },
      { systemSettingId: this.activeSettingId, systemModuleId: this.moduleId }
    )
  }
}
