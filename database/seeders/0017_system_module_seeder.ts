import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemModule from '../../app/models/system_module.js'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    const systemModules = [
      {
        systemModuleId: 1,
        systemModuleName: 'Empleados',
        systemModuleSlug: 'employees',
        systemModuleDescription: 'employees',
        systemModules: 1,
        systemModulePath: '/employees',
        systemModuleGroup: '2. Empresa',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#000000"
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
        systemModuleId: 4,
        systemModuleName: 'Periodos Vacacionales',
        systemModuleSlug: 'vacations',
        systemModuleDescription: 'vacation settings',
        systemModules: 1,
        systemModulePath: '/vacations',
        systemModuleGroup: '4. Configuraciones',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M8 8h8v8h-8z" />
          <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
          <path d="M16 16l3.3 3.3" />
          <path d="M16 8l3.3 -3.3" />
          <path d="M8 8l-3.3 -3.3" />
          <path d="M8 16l-3.3 3.3" />
        </svg>`,
      },
      {
        systemModuleId: 5,
        systemModuleName: 'Usuarios',
        systemModuleSlug: 'users',
        systemModuleDescription: 'users',
        systemModules: 1,
        systemModulePath: '/users',
        systemModuleGroup: '2. Empresa',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
          <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
        </svg>`,
      },
      {
        systemModuleId: 6,
        systemModuleName: 'Asistencia por departamento',
        systemModuleSlug: 'departments-attendance-monitor',
        systemModuleDescription: 'departments attendance monitor',
        systemModules: 1,
        systemModulePath: '/departments-attendance-monitor',
        systemModuleGroup: '1. Reportes',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="128"
          height="128"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#000000"
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
        systemModuleId: 7,
        systemModuleName: 'Asistencia por empleados',
        systemModuleSlug: 'employees-attendance-monitor',
        systemModuleDescription: 'employees attendance monitor',
        systemModules: 1,
        systemModulePath: '/employees-attendance-monitor',
        systemModuleGroup: '1. Reportes',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="128"
          height="128"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#88a4bf"
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
        systemModuleId: 8,
        systemModuleName: 'Roles y permisos',
        systemModuleSlug: 'roles-and-permissions',
        systemModuleDescription: 'roles and permissions',
        systemModules: 1,
        systemModulePath: '/roles-and-permissions',
        systemModuleGroup: '4. Configuraciones',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
          <path d="M12 11m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
          <path d="M12 12l0 2.5" />
        </svg>`,
      },
      {
        systemModuleId: 12,
        systemModuleName: 'Turnos',
        systemModuleSlug: 'shifts',
        systemModuleDescription: 'shifts',
        systemModules: 1,
        systemModulePath: '/shifts',
        systemModuleGroup: '4. Configuraciones',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
        systemModuleId: 13,
        systemModuleName: 'Festividades',
        systemModuleSlug: 'holidays',
        systemModuleDescription: 'holidays',
        systemModules: 1,
        systemModulePath: '/holidays',
        systemModuleGroup: '3. Calendarios',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M3 12h18" />
          <path d="M12 21v-18" />
          <path d="M7.5 7.5l9 9" />
          <path d="M7.5 16.5l9 -9" />
        </svg>`,
      },
      {
        systemModuleId: 14,
        systemModuleName: 'Ajustes Generales',
        systemModuleSlug: 'system-settings',
        systemModuleDescription: 'system settings',
        systemModules: 1,
        systemModulePath: '/system-settings',
        systemModuleGroup: '4. Configuraciones',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
        systemModuleId: 19,
        systemModuleName: 'Matriz de vencimientos',
        systemModuleSlug: 'documents-expiration-matrix',
        systemModuleDescription: 'documents expiration matrix',
        systemModules: 1,
        systemModulePath: '/documents-expiration-matrix',
        systemModuleGroup: '1. Reportes',
        systemModuleActive: 1,
        systemModuleIcon:
          `<svg
            xmlns="http://www.w3.org/2000/svg"
            width="128"
            height="128"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#000000"
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
        systemModuleId: 21,
        systemModuleName: 'Proceeding File Type',
        systemModuleSlug: 'proceeding-file-types',
        systemModuleDescription: 'proceeding file types',
        systemModules: 1,
        systemModulePath: '/proceeding-file-types',
        systemModuleGroup: '5. Otros',
        systemModuleActive: 1,
        systemModuleIcon:
          `<svg
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
          <path d="M8 8h8v8h-8z" />
          <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
          <path d="M16 16l3.3 3.3" />
          <path d="M16 8l3.3 -3.3" />
          <path d="M8 8l-3.3 -3.3" />
          <path d="M8 16l-3.3 3.3" />
        </svg>`,
      },
      {
        systemModuleId: 22,
        systemModuleName: 'Shift Exception Requests',
        systemModuleSlug: 'shift-exception-requests',
        systemModuleDescription: 'Shift exception requests',
        systemModules: 1,
        systemModulePath: '/exception-requests',
        systemModuleGroup: '5. Otros',
        systemModuleActive: 1,
        systemModuleIcon:
          `<svg
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
          <path d="M8 8h8v8h-8z" />
          <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
          <path d="M16 16l3.3 3.3" />
          <path d="M16 8l3.3 -3.3" />
          <path d="M8 8l-3.3 -3.3" />
          <path d="M8 16l-3.3 3.3" />
        </svg>`,
      },
      {
        systemModuleId: 25,
        systemModuleName: 'Organigrama',
        systemModuleSlug: 'organization-chart',
        systemModuleDescription: 'Organization Chart',
        systemModules: 1,
        systemModulePath: '/organization-chart',
        systemModuleGroup: '2. Empresa',
        systemModuleActive: 1,
        systemModuleIcon:
          `<svg
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
          <path d="M3 15m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
          <path d="M15 15m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
          <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
          <path d="M6 15v-1a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v1" />
          <path d="M12 9l0 3" />
        </svg>`,
      },
      {
        systemModuleId: 26,
        systemModuleName: 'Cumpleaños',
        systemModuleSlug: 'birthdays-calendar',
        systemModuleDescription: 'birthdays-calendar',
        systemModules: 1,
        systemModulePath: '/birthdays-calendar',
        systemModuleGroup: '3. Calendarios',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M3 20h18v-8a3 3 0 0 0 -3 -3h-12a3 3 0 0 0 -3 3v8z" />
          <path d="M3 14.803c.312 .135 .654 .204 1 .197a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1c.35 .007 .692 -.062 1 -.197" />
          <path d="M12 4l1.465 1.638a2 2 0 1 1 -3.015 .099l1.55 -1.737z" />
        </svg>`,
      },
      {
        systemModuleId: 27,
        systemModuleName: 'Vacaciones',
        systemModuleSlug: 'vacations-calendar',
        systemModuleDescription: 'vacations-calendar',
        systemModules: 1,
        systemModulePath: '/vacations-calendar',
        systemModuleGroup: '3. Calendarios',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M6 6m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z" />
          <path d="M9 6v-1a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v1" />
          <path d="M6 10h12" />
          <path d="M6 16h12" />
          <path d="M9 20v1" />
          <path d="M15 20v1" />
        </svg>`,
      },
      {
        systemModuleId: 28,
        systemModuleName: 'Aniversarios',
        systemModuleSlug: 'work-anniversaries-calendar',
        systemModuleDescription: 'work-anniversaries-calendar',
        systemModules: 1,
        systemModulePath: '/work-anniversaries-calendar',
        systemModuleGroup: '3. Calendarios',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M8 21l8 0" />
          <path d="M12 17l0 4" />
          <path d="M7 4l10 0" />
          <path d="M17 4v8a5 5 0 0 1 -10 0v-8" />
          <path d="M5 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
          <path d="M19 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
        </svg>`,
      },
      {
        systemModuleId: 29,
        systemModuleName: 'Activos',
        systemModuleSlug: 'supplies',
        systemModuleDescription: 'supplies',
        systemModules: 1,
        systemModulePath: '/supplies',
        systemModuleGroup: '2. Empresa',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" />
          <path d="M12 12l8 -4.5" />
          <path d="M12 12l0 9" />
          <path d="M12 12l-8 -4.5" />
          <path d="M16 5.25l-8 4.5" />
        </svg>`,
      },
      {
        systemModuleId: 30,
        systemModuleName: 'Zonas',
        systemModuleSlug: 'zonas',
        systemModuleDescription: 'zonas',
        systemModules: 1,
        systemModulePath: '/zones',
        systemModuleGroup: '4. Configuraciones',
        systemModuleActive: 1,
        systemModuleIcon:
        `<svg
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
          <path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
          <path d="M4 16v2a2 2 0 0 0 2 2h2" />
          <path d="M16 4h2a2 2 0 0 1 2 2v2" />
          <path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
          <path d="M12 11l0 .01" />
          <path d="M12 18l-3.5 -5a4 4 0 1 1 7 0l-3.5 5" />
        </svg>`,
      },
      {
        systemModuleId: 31,
        systemModuleName: 'Historial de permisos',
        systemModuleSlug: 'permissions-history',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/permissions-history',
        systemModuleGroup: '1. Reportes',
        systemModuleActive: 1,
        systemModuleIcon: `<svg
          xmlns="http://www.w3.org/2000/svg"
          width="128"
          height="128"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#88a4bf"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 8l0 4l2 2" />
          <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
        </svg>`,
      },
      {
        systemModuleId: 32,
        systemModuleName: 'Avisos y noticias',
        systemModuleSlug: 'avisos-y-noticias',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/notices',
        systemModuleGroup: '2. Empresa',
        systemModuleActive: 1,
        systemModuleIcon: `
        <svg
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
          <path d="M18 8a3 3 0 0 1 0 6" />
          <path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5" />
          <path d="M12 8h0l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8" />
        </svg>
        `,
      },
      {
        systemModuleId: 33,
        systemModuleName: 'Puntos de acceso',
        systemModuleSlug: 'puntos-de-acceso',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/access-points',
        systemModuleGroup: '6. ZKSync',
        systemModuleActive: 1,
        systemModuleIcon: `
        <svg
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
          <path d="M12.5 21h-6.5a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v7" />
          <path d="M12 16a1 1 0 0 0 0 2" />
          <path d="M21.121 20.121a3 3 0 1 0 -4.242 0c.418 .419 1.125 1.045 2.121 1.879c1.051 -.89 1.759 -1.516 2.121 -1.879z" />
          <path d="M19 18v.01" />
        </svg>
        `,
      },
      {
        systemModuleId: 34,
        systemModuleName: 'Sucursales',
        systemModuleSlug: 'sucursales',
        systemModuleDescription: 'Catálogo de sucursales por unidad de negocio',
        systemModules: 1,
        systemModulePath: '/branch-offices',
        systemModuleGroup: '2. Empresa',
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
          <path d="M3 21h18" />
          <path d="M5 21v-16l8 -4v18" />
          <path d="M19 21v-10l-6 -4" />
          <path d="M9 9v.01" />
          <path d="M9 12v.01" />
          <path d="M9 15v.01" />
          <path d="M9 18v.01" />
        </svg>`,
      },
    ]

    for (const systemModule of systemModules) {
      const { systemModuleId, ...systemModuleData } = systemModule
      // updateOrCreate: actualiza el módulo si ya existe, lo crea si no existe
      await SystemModule.updateOrCreate(
        { systemModuleId },
        {
          ...systemModuleData,
          systemModules: String(systemModuleData.systemModules),
          systemModuleUpdatedAt: DateTime.now(),
        }
      )
    }
  }
}
