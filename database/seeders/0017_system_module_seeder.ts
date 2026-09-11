import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { resolveSystemModuleGroupIds } from '../../app/helpers/system_module_group_seed_resolver.js'
import { upsertSystemModuleBySlug } from '../../app/helpers/system_catalog_seed_resolver.js'
import type { SystemModuleGroupKey } from '../../app/constants/system_module_group_catalog.js'

/**
 * Siembra el catálogo base de `system_modules`.
 *
 * Cada módulo se identifica por su `systemModuleSlug`: ninguna entrada declara
 * `systemModuleId`, el id lo asigna la BD. La razón está documentada en
 * `app/helpers/system_catalog_seed_resolver.ts`: mientras los seeders
 * escribían ids literales, dos que reclamaban el mismo número se pisaban en
 * silencio vía `updateOrCreate` por id.
 *
 * Idempotente: `upsertSystemModuleBySlug` busca con `withTrashed()` y
 * actualiza la fila existente sin tocar `deletedAt`, así que re-ejecutar el
 * seeder no duplica filas ni revive módulos dados de baja.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores de los resolvers digan quién falló. */
  private readonly seederName = '0017_system_module_seeder'

  async run() {
    /**
     * Cómo declarar un módulo nuevo:
     *  - NO escribir `systemModuleId`: la identidad es `systemModuleSlug` y el
     *    id lo asigna la BD.
     *  - Escribir la clave estable del grupo en `systemModuleGroupKey` (ej. 'empresa').
     *  - Las claves disponibles están en `app/constants/system_module_group_catalog.ts`.
     *  - Para un módulo suelto (sin grupo), usar `systemModuleGroupKey: null` de forma explícita.
     *  - NUNCA escribir el nombre visible del grupo (ej. '2. Empresa'): la columna ya no existe.
     */
    const systemModules = [
      {
        systemModuleName: 'Empleados',
        systemModuleSlug: 'employees',
        systemModuleDescription: 'employees',
        systemModules: 1,
        systemModulePath: '/employees',
        systemModuleGroupKey: null,
        systemModuleOrder: 20,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
          <path d="M6 21v-2a4 4 0 0 1 4 -4h2.5" />
          <path d="M19.001 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
          <path d="M19.001 15.5v1.5" />
          <path d="M19.001 21v1.5" />
          <path d="M22.032 17.25l-1.299 .75" />
          <path d="M17.27 20l-1.3 .75" />
          <path d="M15.97 17.25l1.3 .75" />
          <path d="M20.733 20l1.3 .75" />
        </svg>`,
      },
      {
        systemModuleName: 'Departamentos',
        systemModuleSlug: 'departments',
        systemModuleDescription: 'departments',
        systemModules: 1,
        systemModulePath: '/departments',
        systemModuleGroupKey: 'empresa' as SystemModuleGroupKey,
        systemModuleOrder: 20,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M3 21l18 0" />
          <path d="M9 8l1 0" />
          <path d="M9 12l1 0" />
          <path d="M9 16l1 0" />
          <path d="M14 8l1 0" />
          <path d="M14 12l1 0" />
          <path d="M14 16l1 0" />
          <path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16" />
        </svg>`,
      },
      {
        systemModuleName: 'Puestos',
        systemModuleSlug: 'positions',
        systemModuleDescription: 'positions',
        systemModules: 1,
        systemModulePath: '/positions',
        systemModuleGroupKey: 'empresa' as SystemModuleGroupKey,
        systemModuleOrder: 30,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M3 7m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
          <path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2" />
          <path d="M12 12l0 .01" />
          <path d="M3 13a20 20 0 0 0 18 0" />
        </svg>`,
      },
      {
        systemModuleName: 'Periodos Vacacionales',
        systemModuleSlug: 'vacations',
        systemModuleDescription: 'vacation settings',
        systemModules: 1,
        systemModulePath: '/vacations',
        systemModuleGroupKey: 'configuraciones' as SystemModuleGroupKey,
        systemModuleOrder: 40,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M8 8h8v8h-8z" />
          <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
          <path d="M16 16l3.3 3.3" />
          <path d="M16 8l3.3 -3.3" />
          <path d="M8 8l-3.3 -3.3" />
          <path d="M8 16l-3.3 3.3" />
        </svg>`,
      },
      {
        systemModuleName: 'Usuarios',
        systemModuleSlug: 'users',
        systemModuleDescription: 'users',
        systemModules: 1,
        systemModulePath: '/users',
        systemModuleGroupKey: 'configuraciones' as SystemModuleGroupKey,
        systemModuleOrder: 20,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
          <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
        </svg>`,
      },
      {
        systemModuleName: 'Asistencia por departamento',
        systemModuleSlug: 'departments-attendance-monitor',
        systemModuleDescription: 'departments attendance monitor',
        systemModules: 1,
        systemModulePath: '/departments-attendance-monitor',
        systemModuleGroupKey: 'reportes' as SystemModuleGroupKey,
        systemModuleOrder: 20,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="128"
          height="128"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
          <path d="M9 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
          <path d="M15 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
          <path d="M4 20h14" />
        </svg>`,
      },
      {
        systemModuleName: 'Asistencia por empleados',
        systemModuleSlug: 'employees-attendance-monitor',
        systemModuleDescription: 'employees attendance monitor',
        systemModules: 1,
        systemModulePath: '/employees-attendance-monitor',
        systemModuleGroupKey: null,
        systemModuleOrder: 10,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="128"
          height="128"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
          <path d="M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
          <path d="M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
          <path d="M4 20h14" />
        </svg>`,
      },
      {
        systemModuleName: 'Roles y permisos',
        systemModuleSlug: 'roles-and-permissions',
        systemModuleDescription: 'roles and permissions',
        systemModules: 1,
        systemModulePath: '/roles-and-permissions',
        systemModuleGroupKey: 'configuraciones' as SystemModuleGroupKey,
        systemModuleOrder: 30,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
          <path d="M12 11m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
          <path d="M12 12l0 2.5" />
        </svg>`,
      },
      {
        systemModuleName: 'Turnos',
        systemModuleSlug: 'shifts',
        systemModuleDescription: 'shifts',
        systemModules: 1,
        systemModulePath: '/shifts',
        systemModuleGroupKey: 'zksync' as SystemModuleGroupKey,
        systemModuleOrder: 20,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M8 14v4" />
          <path d="M12 14v4" />
          <path d="M16 14v4" />
        </svg>`,
      },
      {
        systemModuleName: 'Festividades',
        systemModuleSlug: 'holidays',
        systemModuleDescription: 'holidays',
        systemModules: 1,
        systemModulePath: '/holidays',
        systemModuleGroupKey: null,
        systemModuleOrder: 30,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M3 12h18" />
          <path d="M12 21v-18" />
          <path d="M7.5 7.5l9 9" />
          <path d="M7.5 16.5l9 -9" />
        </svg>`,
      },
      {
        systemModuleName: 'Ajustes Generales',
        systemModuleSlug: 'system-settings',
        systemModuleDescription: 'system settings',
        systemModules: 1,
        systemModulePath: '/system-settings',
        systemModuleGroupKey: 'configuraciones' as SystemModuleGroupKey,
        systemModuleOrder: 10,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M12.003 21c-.732 .001 -1.465 -.438 -1.678 -1.317a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c.886 .215 1.325 .957 1.318 1.694" />
          <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
          <path d="M19.001 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
          <path d="M19.001 15.5v1.5" />
          <path d="M19.001 21v1.5" />
          <path d="M22.032 17.25l-1.299 .75" />
          <path d="M17.27 20l-1.3 .75" />
          <path d="M15.97 17.25l1.3 .75" />
          <path d="M20.733 20l1.3 .75" />
        </svg>`,
      },
      {
        systemModuleName: 'Matriz de vencimientos',
        systemModuleSlug: 'documents-expiration-matrix',
        systemModuleDescription: 'documents expiration matrix',
        systemModules: 1,
        systemModulePath: '/documents-expiration-matrix',
        systemModuleGroupKey: 'reportes' as SystemModuleGroupKey,
        systemModuleOrder: 10,
        systemModuleActive: 1,
        systemModuleIcon:
          `<svg
            xmlns="http://www.w3.org/2000/svg"
            width="128"
            height="128"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M8 16v-4a4 4 0 0 1 8 0v4" />
            <path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7" />
            <path d="M6 16m0 1a1 1 0 0 1 1 -1h10a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1z" />
          </svg>`,
      },
      {
        systemModuleName: 'Proceeding File Type',
        systemModuleSlug: 'proceeding-file-types',
        systemModuleDescription: 'proceeding file types',
        systemModules: 1,
        systemModulePath: '/proceeding-file-types',
        systemModuleGroupKey: 'configuraciones' as SystemModuleGroupKey,
        systemModuleOrder: 50,
        systemModuleActive: 1,
        systemModuleIcon:
          `<svg
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
          <path d="M8 8h8v8h-8z" />
          <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
          <path d="M16 16l3.3 3.3" />
          <path d="M16 8l3.3 -3.3" />
          <path d="M8 8l-3.3 -3.3" />
          <path d="M8 16l-3.3 3.3" />
        </svg>`,
      },
      {
        systemModuleName: 'Shift Exception Requests',
        systemModuleSlug: 'shift-exception-requests',
        systemModuleDescription: 'Shift exception requests',
        systemModules: 1,
        systemModulePath: '/exception-requests',
        systemModuleGroupKey: 'zksync' as SystemModuleGroupKey,
        systemModuleOrder: 10,
        systemModuleActive: 1,
        systemModuleIcon:
          `<svg
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
          <path d="M8 8h8v8h-8z" />
          <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
          <path d="M16 16l3.3 3.3" />
          <path d="M16 8l3.3 -3.3" />
          <path d="M8 8l-3.3 -3.3" />
          <path d="M8 16l-3.3 3.3" />
        </svg>`,
      },
      {
        systemModuleName: 'Organigrama',
        systemModuleSlug: 'organization-chart',
        systemModuleDescription: 'Organization Chart',
        systemModules: 1,
        systemModulePath: '/organization-chart',
        systemModuleGroupKey: 'empresa' as SystemModuleGroupKey,
        systemModuleOrder: 10,
        systemModuleActive: 1,
        systemModuleIcon:
          `<svg
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
          <path d="M3 15m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
          <path d="M15 15m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
          <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
          <path d="M6 15v-1a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v1" />
          <path d="M12 9l0 3" />
        </svg>`,
      },
      {
        systemModuleName: 'Cumpleaños',
        systemModuleSlug: 'birthdays-calendar',
        systemModuleDescription: 'birthdays-calendar',
        systemModules: 1,
        systemModulePath: '/birthdays-calendar',
        systemModuleGroupKey: null,
        systemModuleOrder: 50,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M3 20h18v-8a3 3 0 0 0 -3 -3h-12a3 3 0 0 0 -3 3v8z" />
          <path d="M3 14.803c.312 .135 .654 .204 1 .197a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1c.35 .007 .692 -.062 1 -.197" />
          <path d="M12 4l1.465 1.638a2 2 0 1 1 -3.015 .099l1.55 -1.737z" />
        </svg>`,
      },
      {
        systemModuleName: 'Vacaciones',
        systemModuleSlug: 'vacations-calendar',
        systemModuleDescription: 'vacations-calendar',
        systemModules: 1,
        systemModulePath: '/vacations-calendar',
        systemModuleGroupKey: null,
        systemModuleOrder: 40,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M6 6m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z" />
          <path d="M9 6v-1a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v1" />
          <path d="M6 10h12" />
          <path d="M6 16h12" />
          <path d="M9 20v1" />
          <path d="M15 20v1" />
        </svg>`,
      },
      {
        systemModuleName: 'Aniversarios',
        systemModuleSlug: 'work-anniversaries-calendar',
        systemModuleDescription: 'work-anniversaries-calendar',
        systemModules: 1,
        systemModulePath: '/work-anniversaries-calendar',
        systemModuleGroupKey: null,
        systemModuleOrder: 60,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M8 21l8 0" />
          <path d="M12 17l0 4" />
          <path d="M7 4l10 0" />
          <path d="M17 4v8a5 5 0 0 1 -10 0v-8" />
          <path d="M5 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
          <path d="M19 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
        </svg>`,
      },
      {
        systemModuleName: 'Activos',
        systemModuleSlug: 'supplies',
        systemModuleDescription: 'supplies',
        systemModules: 1,
        systemModulePath: '/supplies',
        systemModuleGroupKey: 'empresa' as SystemModuleGroupKey,
        systemModuleOrder: 60,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" />
          <path d="M12 12l8 -4.5" />
          <path d="M12 12l0 9" />
          <path d="M12 12l-8 -4.5" />
          <path d="M16 5.25l-8 4.5" />
        </svg>`,
      },
      {
        systemModuleName: 'Zonas',
        systemModuleSlug: 'zonas',
        systemModuleDescription: 'zonas',
        systemModules: 1,
        systemModulePath: '/zones',
        systemModuleGroupKey: 'empresa' as SystemModuleGroupKey,
        systemModuleOrder: 50,
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
          <path d="M4 16v2a2 2 0 0 0 2 2h2" />
          <path d="M16 4h2a2 2 0 0 1 2 2v2" />
          <path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
          <path d="M12 11l0 .01" />
          <path d="M12 18l-3.5 -5a4 4 0 1 1 7 0l-3.5 5" />
        </svg>`,
      },
      {
        systemModuleName: 'Historial de permisos',
        systemModuleSlug: 'permissions-history',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/permissions-history',
        systemModuleGroupKey: 'reportes' as SystemModuleGroupKey,
        systemModuleOrder: 30,
        systemModuleActive: 1,
        systemModuleIcon: `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="128"
          height="128"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 8l0 4l2 2" />
          <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
        </svg>`,
      },
      {
        systemModuleName: 'Avisos y noticias',
        systemModuleSlug: 'avisos-y-noticias',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/notices',
        systemModuleGroupKey: 'empresa' as SystemModuleGroupKey,
        systemModuleOrder: 70,
        systemModuleActive: 1,
        systemModuleIcon: `
        <svg
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
          <path d="M18 8a3 3 0 0 1 0 6" />
          <path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5" />
          <path d="M12 8h0l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8" />
        </svg>
        `,
      },
      {
        systemModuleName: 'Dispositivos biométricos',
        systemModuleSlug: 'biometric-devices',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/biometric-devices',
        systemModuleGroupKey: 'zksync' as SystemModuleGroupKey,
        systemModuleOrder: 40,
        systemModuleActive: 1,
        systemModuleIcon: `
        <svg
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
          <path d="M12.5 21h-6.5a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v7" />
          <path d="M12 16a1 1 0 0 0 0 2" />
          <path d="M21.121 20.121a3 3 0 1 0 -4.242 0c.418 .419 1.125 1.045 2.121 1.879c1.051 -.89 1.759 -1.516 2.121 -1.879z" />
          <path d="M19 18v.01" />
        </svg>
        `,
      },
      {
        systemModuleName: 'Sucursales',
        systemModuleSlug: 'sucursales',
        systemModuleDescription: 'Catálogo de sucursales por unidad de negocio',
        systemModules: 1,
        systemModulePath: '/branch-offices',
        systemModuleGroupKey: 'empresa' as SystemModuleGroupKey,
        systemModuleOrder: 40,
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
          <path d="M3 21h18" />
          <path d="M5 21v-16l8 -4v18" />
          <path d="M19 21v-10l-6 -4" />
          <path d="M9 9v.01" />
          <path d="M9 12v.01" />
          <path d="M9 15v.01" />
          <path d="M9 18v.01" />
        </svg>`,
      },
      {
        systemModuleName: 'Evaluaciones',
        systemModuleSlug: 'assessment-templates',
        systemModuleDescription: 'Plantillas de evaluación y sus dimensiones',
        systemModules: 1,
        systemModulePath: '/assessment-templates',
        systemModuleGroupKey: 'empresa' as SystemModuleGroupKey,
        systemModuleOrder: 80,
        systemModuleActive: 1,
        systemModuleIcon: `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M.5 0a.5.5 0 0 1 .5.5v15a.5.5 0 0 1-1 0V.5A.5.5 0 0 1 .5 0M2 1.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5zm2 4a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5zm2 4a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5zm2 4a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5z"/>
        </svg>`,
      },
      {
        systemModuleName: 'Catálogo de certificaciones',
        systemModuleSlug: 'certifications',
        systemModuleDescription: 'Certificaciones reconocidas por la empresa y alcance por unidad de negocio',
        systemModules: 1,
        systemModulePath: '/certifications',
        systemModuleGroupKey: 'empresa' as SystemModuleGroupKey,
        systemModuleOrder: 90,
        systemModuleActive: 1,
        systemModuleIcon: `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#88a4bf"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M15 3v4a1 1 0 0 0 1 1h4" />
          <path d="M18 21h-11a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
          <path d="M9 17h7" />
          <path d="M9 13h7" />
        </svg>`,
      },
      {
        systemModuleName: 'Periodos de lactancia',
        systemModuleSlug: 'employee-lactation-periods',
        systemModuleDescription:
          'Registro de periodos de lactancia (NOM-037-STPS-2023 / LFT artículo 170)',
        systemModules: 1,
        systemModulePath: '/employee-lactation-periods',
        systemModuleGroupKey: 'empresa' as SystemModuleGroupKey,
        systemModuleOrder: 100,
        systemModuleActive: 1,
        systemModuleIcon: `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#88a4bf"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
          <path d="M17.5 7a5.5 5.5 0 1 0 -11 0" />
          <path d="M7 11v8a3 3 0 0 0 3 3h4a3 3 0 0 0 3 -3v-8" />
        </svg>`,
      },
      {
        systemModuleName: 'Repse',
        systemModuleSlug: 'repse-registrations',
        systemModuleDescription:
          'Registro REPSE de la empresa ante la STPS (folio, fecha de registro y vencimiento)',
        systemModules: 1,
        systemModulePath: '/repse',
        systemModuleGroupKey: 'empresa' as SystemModuleGroupKey,
        systemModuleOrder: 120,
        systemModuleActive: 1,
        systemModuleIcon: `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#88a4bf"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
          <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>`,
      },
      {
        systemModuleName: 'Aplicabilidad',
        systemModuleSlug: 'compliance',
        systemModuleDescription:
          'Calcula el instrumento aplicable (Guía II / Guía III / ninguno) por sucursal según los umbrales de la NOM-035-STPS-2018',
        systemModules: 1,
        systemModulePath: '/questionnaire-applicability',
        systemModuleGroupKey: 'nom-035' as SystemModuleGroupKey,
        systemModuleOrder: 10,
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
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>`,
      },
      {
        systemModuleName: 'Teletrabajadores',
        systemModuleSlug: 'telework-workers',
        systemModuleDescription:
          'Listado derivado de la NOM-037-STPS-2023 (numeral 5.1): teletrabajadores con más del 40% de jornada remota, con puesto, modalidad, porcentaje y lugar donde laboran',
        systemModules: 1,
        systemModulePath: '/telework-workers',
        systemModuleGroupKey: 'nom-037' as SystemModuleGroupKey,
        systemModuleOrder: 10,
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
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>`,
      },
    ]

    // Resuelve todas las claves de grupo en una sola query, antes de escribir
    // la primera fila. Si alguna clave no existe entre los grupos vivos del
    // catálogo, la ejecución aborta aquí con el nombre del seeder y la clave
    // faltante — nunca llega al bucle de escritura (CA4 USRH1788288026045).
    const groupIdByKey = await resolveSystemModuleGroupIds(
      systemModules.map((m) => m.systemModuleGroupKey),
      this.seederName
    )

    for (const systemModule of systemModules) {
      const { systemModuleGroupKey, ...systemModuleData } = systemModule

      // La identidad es el slug: el helper busca con withTrashed() —las filas
      // con baja lógica cuentan para la PK pero el scope de SoftDeletes las
      // oculta— y actualiza la existente sin tocar deletedAt, así que un
      // módulo retirado no revive ni se duplica al re-ejecutar el seeder.
      await upsertSystemModuleBySlug(
        {
          ...systemModuleData,
          systemModules: String(systemModuleData.systemModules),
          systemModuleGroupId: systemModuleGroupKey
            ? (groupIdByKey.get(systemModuleGroupKey) ?? null)
            : null,
        },
        this.seederName
      )
    }
  }
}
