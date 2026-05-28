import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemPermission from '../../app/models/system_permission.js'

export default class extends BaseSeeder {
  async run() {
    const systemPermissions = [
      {
        systemPermissionId: 1,
        systemPermissionName: 'Create',
        systemPermissionSlug: 'create',
        systemModuleId: 1
      },
      {
        systemPermissionId: 2,
        systemPermissionName: 'Update',
        systemPermissionSlug: 'update',
        systemModuleId: 1
      },
      {
        systemPermissionId: 3,
        systemPermissionName: 'Delete',
        systemPermissionSlug: 'delete',
        systemModuleId: 1
      },
      {
        systemPermissionId: 4,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 1
      },
      {
        systemPermissionId: 70,
        systemPermissionName: 'Add exception',
        systemPermissionSlug: 'add-exception',
        systemModuleId: 1
      },
      {
        systemPermissionId: 71,
        systemPermissionName: 'Manage shift',
        systemPermissionSlug: 'manage-shift',
        systemModuleId: 1
      },
      {
        systemPermissionId: 76,
        systemPermissionName: 'Manage Vacation',
        systemPermissionSlug: 'manage-vacation',
        systemModuleId: 1
      },
      {
        systemPermissionId: 77,
        systemPermissionName: 'Exception Request',
        systemPermissionSlug: 'exception-request',
        systemModuleId: 1
      },
      {
        systemPermissionId: 80,
        systemPermissionName: 'Read Files',
        systemPermissionSlug: 'read-only-files',
        systemModuleId: 1
      },
      {
        systemPermissionId: 81,
        systemPermissionName: 'Manage Files',
        systemPermissionSlug: 'manage-files',
        systemModuleId: 1
      },
      {
        systemPermissionId: 82,
        systemPermissionName: 'Read Work Disabilities',
        systemPermissionSlug: 'read-work-disabilities',
        systemModuleId: 1
      },
      {
        systemPermissionId: 83,
        systemPermissionName: 'Manage Work Disabilities',
        systemPermissionSlug: 'manage-work-disabilities',
        systemModuleId: 1
      },
      {
        systemPermissionId: 92,
        systemPermissionName: 'Manage Shift Change',
        systemPermissionSlug: 'manage-shift-change',
        systemModuleId: 1
      },
      {
        systemPermissionId: 103,
        systemPermissionName: 'Manage Responsible Read',
        systemPermissionSlug: 'manage-responsible-read',
        systemModuleId: 1
      },
      {
        systemPermissionId: 104,
        systemPermissionName: 'Manage Responsible Edit',
        systemPermissionSlug: 'manage-responsible-edit',
        systemModuleId: 1
      },
      {
        systemPermissionId: 106,
        systemPermissionName: 'Manage BioTime',
        systemPermissionSlug: 'manage-biotime',
        systemModuleId: 1
      },
      {
        systemPermissionId: 107,
        systemPermissionName: 'Manage Assigned Read',
        systemPermissionSlug: 'manage-assigned-read',
        systemModuleId: 1
      },
      {
        systemPermissionId: 108,
        systemPermissionName: 'Manage Assigned Edit',
        systemPermissionSlug: 'manage-assigned-edit',
        systemModuleId: 1
      },
      {
        systemPermissionId: 109,
        systemPermissionName: 'Read Terminated Employees',
        systemPermissionSlug: 'read-terminated-employees',
        systemModuleId: 1
      },
      {
        systemPermissionId: 110,
        systemPermissionName: 'Update Information',
        systemPermissionSlug: 'update-information',
        systemModuleId: 1
      },
      {
        systemPermissionId: 111,
        systemPermissionName: 'Remove shift assigned at day',
        systemPermissionSlug: 'remove-shift-assigned-to-the-day',
        systemModuleId: 1
      },
      {
        systemPermissionId: 113,
        systemPermissionName: 'Full employee assigned',
        systemPermissionSlug: 'full-employee-assigned',
        systemModuleId: 1
      },
      {
        systemPermissionId: 13,
        systemPermissionName: 'Create',
        systemPermissionSlug: 'create',
        systemModuleId: 4
      },
      {
        systemPermissionId: 14,
        systemPermissionName: 'Update',
        systemPermissionSlug: 'update',
        systemModuleId: 4
      },
      {
        systemPermissionId: 15,
        systemPermissionName: 'Delete',
        systemPermissionSlug: 'delete',
        systemModuleId: 4
      },
      {
        systemPermissionId: 16,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 4
      },
      {
        systemPermissionId: 17,
        systemPermissionName: 'Create',
        systemPermissionSlug: 'create',
        systemModuleId: 5
      },
      {
        systemPermissionId: 18,
        systemPermissionName: 'Update',
        systemPermissionSlug: 'update',
        systemModuleId: 5
      },
      {
        systemPermissionId: 19,
        systemPermissionName: 'Delete',
        systemPermissionSlug: 'delete',
        systemModuleId: 5
      },
      {
        systemPermissionId: 20,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 5
      },
      {
        systemPermissionId: 21,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 6
      },
      {
        systemPermissionId: 105,
        systemPermissionName: 'Consecutive Faults',
        systemPermissionSlug: 'consecutive-faults',
        systemModuleId: 6
      },
      {
        systemPermissionId: 22,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 7
      },
      {
        systemPermissionId: 78,
        systemPermissionName: 'Read time worked',
        systemPermissionSlug: 'read-time-worked',
        systemModuleId: 7
      },
      {
        systemPermissionId: 79,
        systemPermissionName: 'Add manual assist',
        systemPermissionSlug: 'add-assist-manual',
        systemModuleId: 7
      },
      {
        systemPermissionId: 93,
        systemPermissionName: 'Sync Assist',
        systemPermissionSlug: 'sync-assist',
        systemModuleId: 7
      },
      {
        systemPermissionId: 94,
        systemPermissionName: 'Consecutive Faults',
        systemPermissionSlug: 'consecutive-faults',
        systemModuleId: 7
      },
      {
        systemPermissionId: 112,
        systemPermissionName: 'Delete check assist',
        systemPermissionSlug: 'delete-check-assist',
        systemModuleId: 7
      },
      {
        systemPermissionId: 23,
        systemPermissionName: 'Update',
        systemPermissionSlug: 'update',
        systemModuleId: 8
      },
      {
        systemPermissionId: 24,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 8
      },
      {
        systemPermissionId: 37,
        systemPermissionName: 'Create',
        systemPermissionSlug: 'create',
        systemModuleId: 12
      },
      {
        systemPermissionId: 38,
        systemPermissionName: 'Update',
        systemPermissionSlug: 'update',
        systemModuleId: 12
      },
      {
        systemPermissionId: 39,
        systemPermissionName: 'Delete',
        systemPermissionSlug: 'delete',
        systemModuleId: 12
      },
      {
        systemPermissionId: 40,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 12
      },
      {
        systemPermissionId: 41,
        systemPermissionName: 'Create',
        systemPermissionSlug: 'create',
        systemModuleId: 13
      },
      {
        systemPermissionId: 42,
        systemPermissionName: 'Update',
        systemPermissionSlug: 'update',
        systemModuleId: 13
      },
      {
        systemPermissionId: 43,
        systemPermissionName: 'Delete',
        systemPermissionSlug: 'delete',
        systemModuleId: 13
      },
      {
        systemPermissionId: 44,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 13
      },
      {
        systemPermissionId: 45,
        systemPermissionName: 'Create',
        systemPermissionSlug: 'create',
        systemModuleId: 14
      },
      {
        systemPermissionId: 46,
        systemPermissionName: 'Update',
        systemPermissionSlug: 'update',
        systemModuleId: 14
      },
      {
        systemPermissionId: 47,
        systemPermissionName: 'Delete',
        systemPermissionSlug: 'delete',
        systemModuleId: 14
      },
      {
        systemPermissionId: 48,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 14
      },
      {
        systemPermissionId: 65,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 19
      },
      {
        systemPermissionId: 66,
        systemPermissionName: 'Create',
        systemPermissionSlug: 'create',
        systemModuleId: 21
      },
      {
        systemPermissionId: 67,
        systemPermissionName: 'Update',
        systemPermissionSlug: 'update',
        systemModuleId: 21
      },
      {
        systemPermissionId: 68,
        systemPermissionName: 'Delete',
        systemPermissionSlug: 'delete',
        systemModuleId: 21
      },
      {
        systemPermissionId: 69,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 21
      },
      {
        systemPermissionId: 72,
        systemPermissionName: 'Create',
        systemPermissionSlug: 'create',
        systemModuleId: 22
      },
      {
        systemPermissionId: 73,
        systemPermissionName: 'Update',
        systemPermissionSlug: 'update',
        systemModuleId: 22
      },
      {
        systemPermissionId: 74,
        systemPermissionName: 'Delete',
        systemPermissionSlug: 'delete',
        systemModuleId: 22
      },
      {
        systemPermissionId: 75,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 22
      },
      {
        systemPermissionId: 88,
        systemPermissionName: 'Update',
        systemPermissionSlug: 'update',
        systemModuleId: 25
      },
      {
        systemPermissionId: 89,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 25
      },
      {
        systemPermissionId: 90,
        systemPermissionName: 'Delete',
        systemPermissionSlug: 'delete',
        systemModuleId: 25
      },
      {
        systemPermissionId: 91,
        systemPermissionName: 'Create',
        systemPermissionSlug: 'create',
        systemModuleId: 25
      },
      {
        systemPermissionId: 95,
        systemPermissionName: 'read',
        systemPermissionSlug: 'read',
        systemModuleId: 26
      },
      {
        systemPermissionId: 99,
        systemPermissionName: 'read',
        systemPermissionSlug: 'read',
        systemModuleId: 27
      },
      {
        systemPermissionId: 114,
        systemPermissionName: 'Ver Aniversarios',
        systemPermissionSlug: 'read',
        systemModuleId: 28
      },
      {
        systemPermissionId: 115,
        systemPermissionName: 'Acceder',
        systemPermissionSlug: 'read',
        systemModuleId: 29
      },
      {
        systemPermissionId: 116,
        systemPermissionName: 'Crear',
        systemPermissionSlug: 'create',
        systemModuleId: 29
      },
      {
        systemPermissionId: 117,
        systemPermissionName: 'Editar',
        systemPermissionSlug: 'update',
        systemModuleId: 29
      },
      {
        systemPermissionId: 118,
        systemPermissionName: 'Eliminar',
        systemPermissionSlug: 'delete',
        systemModuleId: 29
      },
      {
        systemPermissionId: 119,
        systemPermissionName: 'Acceder',
        systemPermissionSlug: 'read',
        systemModuleId: 30
      },
      {
        systemPermissionId: 120,
        systemPermissionName: 'Crear',
        systemPermissionSlug: 'create',
        systemModuleId: 30
      },
      {
        systemPermissionId: 121,
        systemPermissionName: 'Editar',
        systemPermissionSlug: 'update',
        systemModuleId: 30
      },
      {
        systemPermissionId: 122,
        systemPermissionName: 'Eliminar',
        systemPermissionSlug: 'delete',
        systemModuleId: 30
      },
      {
        systemPermissionId: 123,
        systemPermissionName: 'Acceder',
        systemPermissionSlug: 'read',
        systemModuleId: 31
      },
      {
        systemPermissionId: 124,
        systemPermissionName: 'Download summary report',
        systemPermissionSlug: 'download-summary',
        systemModuleId: 7
      },
      {
        systemPermissionId: 125,
        systemPermissionName: 'Display discounts in a summary',
        systemPermissionSlug: 'display-discounts-summary',
        systemModuleId: 7
      },
      {
        systemPermissionId: 126,
        systemPermissionName: 'Display payments in summary',
        systemPermissionSlug: 'display-payments-summary',
        systemModuleId: 7
      },
      {
        systemPermissionId: 127,
        systemPermissionName: 'Acceder',
        systemPermissionSlug: 'read',
        systemModuleId: 32
      },
      {
        systemPermissionId: 128,
        systemPermissionName: 'Crear',
        systemPermissionSlug: 'create',
        systemModuleId: 32
      },
      {
        systemPermissionId: 129,
        systemPermissionName: 'Editar',
        systemPermissionSlug: 'update',
        systemModuleId: 32
      },
      {
        systemPermissionId: 130,
        systemPermissionName: 'Eliminar',
        systemPermissionSlug: 'delete',
        systemModuleId: 32
      },
      {
        systemPermissionId: 131,
        systemPermissionName: 'Acceder',
        systemPermissionSlug: 'read',
        systemModuleId: 33
      },
      {
        systemPermissionId: 132,
        systemPermissionName: 'Crear',
        systemPermissionSlug: 'create',
        systemModuleId: 33
      },
      {
        systemPermissionId: 133,
        systemPermissionName: 'Editar',
        systemPermissionSlug: 'update',
        systemModuleId: 33
      },
      {
        systemPermissionId: 134,
        systemPermissionName: 'Eliminar',
        systemPermissionSlug: 'delete',
        systemModuleId: 33
      },
      {
        systemPermissionId: 135,
        systemPermissionName: 'Show face ID',
        systemPermissionSlug: 'show-face-id',
        systemModuleId: 1
      },
      {
        systemPermissionId: 136,
        systemPermissionName: 'Upload face ID',
        systemPermissionSlug: 'upload-face-id',
        systemModuleId: 1
      },
      {
        systemPermissionId: 137,
        systemPermissionName: 'Show fingers',
        systemPermissionSlug: 'show-fingers',
        systemModuleId: 1
      },
      {
        systemPermissionId: 138,
        systemPermissionName: 'Upload fingers',
        systemPermissionSlug: 'upload-fingers',
        systemModuleId: 1
      },
      {
        systemPermissionId: 139,
        systemPermissionName: 'Acceder',
        systemPermissionSlug: 'read',
        systemModuleId: 34
      },
      {
        systemPermissionId: 140,
        systemPermissionName: 'Crear',
        systemPermissionSlug: 'create',
        systemModuleId: 34
      },
      {
        systemPermissionId: 141,
        systemPermissionName: 'Editar',
        systemPermissionSlug: 'update',
        systemModuleId: 34
      },
      {
        systemPermissionId: 142,
        systemPermissionName: 'Eliminar',
        systemPermissionSlug: 'delete',
        systemModuleId: 34
      },
      {
        systemPermissionId: 143,
        systemPermissionName: 'Gestionar correos RH por faltas de asistencia',
        systemPermissionSlug: 'manage-attendance-fault-hr-emails',
        systemModuleId: 14
      },
      {
        systemPermissionId: 144,
        systemPermissionName: 'Read',
        systemPermissionSlug: 'read',
        systemModuleId: 35
      },
      {
        systemPermissionId: 145,
        systemPermissionName: 'Create',
        systemPermissionSlug: 'create',
        systemModuleId: 35
      },
      {
        systemPermissionId: 146,
        systemPermissionName: 'Update',
        systemPermissionSlug: 'update',
        systemModuleId: 35
      },
      {
        systemPermissionId: 147,
        systemPermissionName: 'Delete',
        systemPermissionSlug: 'delete',
        systemModuleId: 35
      },
      {
        systemPermissionId: 148,
        systemPermissionName: 'Acceder',
        systemPermissionSlug: 'read',
        systemModuleId: 36
      },
      {
        systemPermissionId: 149,
        systemPermissionName: 'Crear',
        systemPermissionSlug: 'create',
        systemModuleId: 36
      },
      {
        systemPermissionId: 150,
        systemPermissionName: 'Editar',
        systemPermissionSlug: 'update',
        systemModuleId: 36
      },
      {
        systemPermissionId: 151,
        systemPermissionName: 'Eliminar',
        systemPermissionSlug: 'delete',
        systemModuleId: 36
      },
      {
        systemPermissionId: 152,
        systemPermissionName: 'Acceder',
        systemPermissionSlug: 'read',
        systemModuleId: 37
      },
      {
        systemPermissionId: 153,
        systemPermissionName: 'Crear',
        systemPermissionSlug: 'create',
        systemModuleId: 37
      },
      {
        systemPermissionId: 154,
        systemPermissionName: 'Editar',
        systemPermissionSlug: 'update',
        systemModuleId: 37
      },
      {
        systemPermissionId: 155,
        systemPermissionName: 'Eliminar',
        systemPermissionSlug: 'delete',
        systemModuleId: 37
      },
      {
        systemPermissionId: 160,
        systemPermissionName: 'Gestionar empresas contratantes',
        systemPermissionSlug: 'gestion',
        systemModuleId: 39
      }
    ]

    for (const systemPermission of systemPermissions) {
      await SystemPermission.updateOrCreate(
        { systemPermissionId: systemPermission.systemPermissionId },
        systemPermission,
      )
    }
  }
}
