import { BaseSeeder } from '@adonisjs/lucid/seeders'
import {
  resolveSystemModuleIdsBySlug,
  upsertSystemPermissionsBySlug,
  type SystemPermissionSeedValues,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Siembra los 118 permisos de los módulos que declara `0017_system_module_seeder`.
 *
 * La identidad de un permiso es el par (módulo, slug); la del módulo, su slug.
 * Este seeder no escribe ningún id literal: referencia cada módulo por slug y
 * los resuelve de una sola vez con `resolveSystemModuleIdsBySlug` antes de
 * escribir, y el `system_permission_id` lo asigna la BD. Elegir los números a
 * mano es lo que permitía que dos seeders reclamaran el mismo id y el segundo
 * sobrescribiera en silencio la fila del primero
 * (ver `app/helpers/system_catalog_seed_resolver.ts`).
 *
 * Si un módulo referenciado no existe, el resolver lanza nombrándolo: un
 * permiso nunca queda colgado del módulo equivocado ni se omite en silencio.
 *
 * Idempotente: `upsertSystemPermissionsBySlug` actualiza el permiso que ya
 * existe —incluido el dado de baja lógica, sin revivirlo— y crea el que no.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0018_system_permission_seeder'

  /**
   * Permisos agrupados por el módulo dueño, identificado por su slug. El orden
   * es irrelevante para la identidad: cada fila se ubica por (módulo, slug).
   */
  private readonly permissionsByModule: {
    systemModuleSlug: string
    permissions: SystemPermissionSeedValues[]
  }[] = [
    {
      systemModuleSlug: 'employees',
      permissions: [
        { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Add exception', systemPermissionSlug: 'add-exception' },
        { systemPermissionName: 'Manage shift', systemPermissionSlug: 'manage-shift' },
        { systemPermissionName: 'Manage Vacation', systemPermissionSlug: 'manage-vacation' },
        { systemPermissionName: 'Exception Request', systemPermissionSlug: 'exception-request' },
        { systemPermissionName: 'Read Files', systemPermissionSlug: 'read-only-files' },
        { systemPermissionName: 'Manage Files', systemPermissionSlug: 'manage-files' },
        {
          systemPermissionName: 'Read Work Disabilities',
          systemPermissionSlug: 'read-work-disabilities',
        },
        {
          systemPermissionName: 'Manage Work Disabilities',
          systemPermissionSlug: 'manage-work-disabilities',
        },
        {
          systemPermissionName: 'Manage Shift Change',
          systemPermissionSlug: 'manage-shift-change',
        },
        {
          systemPermissionName: 'Manage Responsible Read',
          systemPermissionSlug: 'manage-responsible-read',
        },
        {
          systemPermissionName: 'Manage Responsible Edit',
          systemPermissionSlug: 'manage-responsible-edit',
        },
        { systemPermissionName: 'Manage BioTime', systemPermissionSlug: 'manage-biotime' },
        {
          systemPermissionName: 'Manage Assigned Read',
          systemPermissionSlug: 'manage-assigned-read',
        },
        {
          systemPermissionName: 'Manage Assigned Edit',
          systemPermissionSlug: 'manage-assigned-edit',
        },
        {
          systemPermissionName: 'Read Terminated Employees',
          systemPermissionSlug: 'read-terminated-employees',
        },
        { systemPermissionName: 'Update Information', systemPermissionSlug: 'update-information' },
        {
          systemPermissionName: 'Remove shift assigned at day',
          systemPermissionSlug: 'remove-shift-assigned-to-the-day',
        },
        {
          systemPermissionName: 'Full employee assigned',
          systemPermissionSlug: 'full-employee-assigned',
        },
        { systemPermissionName: 'Show face ID', systemPermissionSlug: 'show-face-id' },
        { systemPermissionName: 'Upload face ID', systemPermissionSlug: 'upload-face-id' },
        { systemPermissionName: 'Show fingers', systemPermissionSlug: 'show-fingers' },
        { systemPermissionName: 'Upload fingers', systemPermissionSlug: 'upload-fingers' },
      ],
    },
    {
      systemModuleSlug: 'vacations',
      permissions: [
        { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
      ],
    },
    {
      systemModuleSlug: 'users',
      permissions: [
        { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
      ],
    },
    {
      systemModuleSlug: 'departments-attendance-monitor',
      permissions: [
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Consecutive Faults', systemPermissionSlug: 'consecutive-faults' },
      ],
    },
    {
      systemModuleSlug: 'employees-attendance-monitor',
      permissions: [
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Read time worked', systemPermissionSlug: 'read-time-worked' },
        { systemPermissionName: 'Add manual assist', systemPermissionSlug: 'add-assist-manual' },
        { systemPermissionName: 'Sync Assist', systemPermissionSlug: 'sync-assist' },
        { systemPermissionName: 'Consecutive Faults', systemPermissionSlug: 'consecutive-faults' },
        {
          systemPermissionName: 'Delete check assist',
          systemPermissionSlug: 'delete-check-assist',
        },
        {
          systemPermissionName: 'Download summary report',
          systemPermissionSlug: 'download-summary',
        },
        {
          systemPermissionName: 'Display discounts in a summary',
          systemPermissionSlug: 'display-discounts-summary',
        },
        {
          systemPermissionName: 'Display payments in summary',
          systemPermissionSlug: 'display-payments-summary',
        },
        { systemPermissionName: 'Shift coverage', systemPermissionSlug: 'shift-coverage' },
        { systemPermissionName: 'See payroll mode', systemPermissionSlug: 'see-payroll' },
      ],
    },
    {
      systemModuleSlug: 'roles-and-permissions',
      permissions: [
        { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
      ],
    },
    {
      systemModuleSlug: 'shifts',
      permissions: [
        { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
      ],
    },
    {
      systemModuleSlug: 'holidays',
      permissions: [
        { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
      ],
    },
    {
      systemModuleSlug: 'system-settings',
      permissions: [
        { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
        {
          systemPermissionName: 'Gestionar correos RH por faltas de asistencia',
          systemPermissionSlug: 'manage-attendance-fault-hr-emails',
        },
      ],
    },
    {
      systemModuleSlug: 'documents-expiration-matrix',
      permissions: [{ systemPermissionName: 'Read', systemPermissionSlug: 'read' }],
    },
    {
      systemModuleSlug: 'proceeding-file-types',
      permissions: [
        { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
      ],
    },
    {
      systemModuleSlug: 'shift-exception-requests',
      permissions: [
        { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
      ],
    },
    {
      systemModuleSlug: 'organization-chart',
      permissions: [
        { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
        { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
      ],
    },
    {
      systemModuleSlug: 'birthdays-calendar',
      permissions: [{ systemPermissionName: 'read', systemPermissionSlug: 'read' }],
    },
    {
      systemModuleSlug: 'vacations-calendar',
      permissions: [{ systemPermissionName: 'read', systemPermissionSlug: 'read' }],
    },
    {
      systemModuleSlug: 'work-anniversaries-calendar',
      permissions: [{ systemPermissionName: 'Ver Aniversarios', systemPermissionSlug: 'read' }],
    },
    {
      systemModuleSlug: 'supplies',
      permissions: [
        { systemPermissionName: 'Acceder', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Crear', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Editar', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Eliminar', systemPermissionSlug: 'delete' },
      ],
    },
    {
      systemModuleSlug: 'zonas',
      permissions: [
        { systemPermissionName: 'Acceder', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Crear', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Editar', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Eliminar', systemPermissionSlug: 'delete' },
      ],
    },
    {
      systemModuleSlug: 'permissions-history',
      permissions: [{ systemPermissionName: 'Acceder', systemPermissionSlug: 'read' }],
    },
    {
      systemModuleSlug: 'avisos-y-noticias',
      permissions: [
        { systemPermissionName: 'Acceder', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Crear', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Editar', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Eliminar', systemPermissionSlug: 'delete' },
      ],
    },
    {
      systemModuleSlug: 'biometric-devices',
      permissions: [
        { systemPermissionName: 'Acceder', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Crear', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Editar', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Eliminar', systemPermissionSlug: 'delete' },
      ],
    },
    {
      systemModuleSlug: 'sucursales',
      permissions: [
        { systemPermissionName: 'Acceder', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Crear', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Editar', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Eliminar', systemPermissionSlug: 'delete' },
      ],
    },
    {
      systemModuleSlug: 'assessment-templates',
      permissions: [
        { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
      ],
    },
    {
      systemModuleSlug: 'certifications',
      permissions: [
        { systemPermissionName: 'Acceder', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Crear', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Editar', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Eliminar', systemPermissionSlug: 'delete' },
      ],
    },
    {
      systemModuleSlug: 'employee-lactation-periods',
      permissions: [
        { systemPermissionName: 'Acceder', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Crear', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Editar', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Eliminar', systemPermissionSlug: 'delete' },
      ],
    },
    {
      systemModuleSlug: 'repse-registrations',
      permissions: [
        { systemPermissionName: 'Acceder', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Crear', systemPermissionSlug: 'create' },
        { systemPermissionName: 'Editar', systemPermissionSlug: 'update' },
        { systemPermissionName: 'Eliminar', systemPermissionSlug: 'delete' },
        { systemPermissionName: 'Gestionar', systemPermissionSlug: 'gestion' },
      ],
    },
    {
      systemModuleSlug: 'compliance',
      permissions: [{ systemPermissionName: 'Acceder', systemPermissionSlug: 'read' }],
    },
    {
      systemModuleSlug: 'telework-workers',
      permissions: [{ systemPermissionName: 'Acceder', systemPermissionSlug: 'read' }],
    },
  ]

  async run() {
    const moduleIdBySlug = await resolveSystemModuleIdsBySlug(
      this.permissionsByModule.map((group) => group.systemModuleSlug),
      this.seederName
    )

    for (const group of this.permissionsByModule) {
      const systemModuleId = moduleIdBySlug.get(group.systemModuleSlug)!
      await upsertSystemPermissionsBySlug(systemModuleId, group.permissions, this.seederName)
    }
  }
}
