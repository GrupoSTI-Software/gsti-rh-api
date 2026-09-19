import { BaseSeeder } from '@adonisjs/lucid/seeders'
import {
  upsertSystemModuleBySlug,
  upsertSystemPermissionsBySlug,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Registra el módulo "Calendario" y sus cuatro permisos.
 *
 * Existe porque este módulo era el único del catálogo declarado SOLO en una
 * migración (`1788800000000_create_calendar_system_module`). Esa migración
 * identifica por slug y es correcta, pero corre antes que los seeders: sobre
 * una base vacía creaba la fila con el id 1 y después
 * `0017_system_module_seeder` reclamaba ese mismo id para `employees` y la
 * sobrescribía. El módulo desaparecía de todo entorno nuevo.
 *
 * Al declararlo también aquí, el catálogo vuelve a tener un solo tipo de
 * declarante —el seeder— y el módulo se recupera igual en una base nueva que
 * en una que ya venía dañada: la identidad es el slug, así que si la migración
 * ya lo creó este seeder actualiza esa misma fila en vez de duplicarla.
 *
 * Numerado 0061 a propósito: debe correr DESPUÉS de `0017_system_module_seeder`.
 *
 * NO concede permisos a ningún rol. La migración original los espejaba desde
 * `holidays`, `vacations-calendar`, `birthdays-calendar` y
 * `work-anniversaries-calendar`; reproducir ese reparto es una decisión de
 * permisos pendiente, no parte de la recuperación del módulo.
 *
 * Idempotente: se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  private readonly seederName = '0061_calendar_module_seeder'

  /** Permisos del módulo. El id lo asigna la BD; la identidad es (módulo, slug). */
  private readonly permissions = [
    { systemPermissionName: 'Read', systemPermissionSlug: 'read' },
    { systemPermissionName: 'Create', systemPermissionSlug: 'create' },
    { systemPermissionName: 'Update', systemPermissionSlug: 'update' },
    { systemPermissionName: 'Delete', systemPermissionSlug: 'delete' },
  ]

  async run() {
    const systemModuleId = await upsertSystemModuleBySlug(
      {
        systemModuleName: 'Calendario',
        systemModuleSlug: 'calendar',
        systemModuleDescription: 'calendar',
        systemModules: '1',
        systemModulePath: '/calendar',
        systemModuleActive: 1,
        systemModuleOrder: 25,
        // Módulo suelto: la migración original lo creaba sin grupo.
        systemModuleGroupId: null,
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
          <path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z" />
          <path d="M16 3v4" />
          <path d="M8 3v4" />
          <path d="M4 11h16" />
          <path d="M7 14h.013" />
          <path d="M10.01 14h.005" />
          <path d="M13.01 14h.005" />
          <path d="M16.015 14h.005" />
          <path d="M13.015 17h.005" />
          <path d="M7.01 17h.005" />
          <path d="M10.01 17h.005" />
        </svg>`,
      },
      this.seederName
    )

    await upsertSystemPermissionsBySlug(systemModuleId, this.permissions, this.seederName)
  }
}
