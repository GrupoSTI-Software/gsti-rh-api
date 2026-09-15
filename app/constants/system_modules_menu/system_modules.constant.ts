import type { ActionCatalogEntry } from '#constants/permission_catalog_types'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
import { POSITIONS_PERMISSION_CATALOG } from '#constants/positions_permission_catalog'
import { ATTENDANCE_MONITOR_PERMISSION_CATALOG } from '#constants/attendance_monitor_permission_catalog'
import { ACCESS_POINT_PERMISSION_CATALOG } from '#constants/access_point_permission_catalog'

/**
 * Fuente única del catálogo de módulos del sistema: menú (grupo, orden,
 * icono, ruta), identidad (slug), permisos y exigencia de permisos.
 *
 * Cómo se usa:
 *  - Agregar un módulo o permiso, renombrarlo o cambiarle el icono se hace
 *    SOLO aquí. Los seeders `0061_system_module_group_seeder` y
 *    `0062_system_module_seeder` lo llevan a la base de datos, y
 *    `system_modules_catalog.ts` (árbol de permisos de sesión) se deriva de
 *    aquí.
 *  - El slug debe ser igual al primer segmento de `systemModulePath`: el
 *    backoffice protege cada pantalla preguntando por el módulo cuyo slug
 *    coincide con la ruta (`components/asideMenu/domain/menu.helpers.ts`).
 *    Única excepción: `repse-registrations` en `/repse`, alias del BO.
 *  - Un módulo que solo existe para dar permisos (sin pantalla propia) lleva
 *    `#` en la ruta: el backoffice lo oculta del menú.
 *  - Declarar solo permisos que alguna operación real verifica (API o BO): una
 *    casilla que nadie consulta le miente a quien administra roles.
 *  - `systemModuleRetired: true` da de baja el módulo: la pantalla del BO
 *    responde 403 a todo rol salvo root y owner.
 *  - `systemModulePermissionEnforcementActive` va en `true` en todo módulo cuyos
 *    permisos exige el API (`middleware.permissionGate`, `hasAccess` o
 *    equivalentes). En `false`, el gate deja pasar a cualquier usuario
 *    autenticado y la pantalla de roles lo marca "Solo declarada": solo el
 *    backoffice respeta esos permisos.
 */

export interface SystemModulePermissionDeclaration {
  systemPermissionName: string
  systemPermissionSlug: string
}

export interface SystemModuleDeclaration {
  systemModuleName: string
  systemModuleSlug: string
  systemModuleDescription: string
  systemModules: number
  systemModulePath: string
  systemModuleOrder: number
  systemModuleActive: 0 | 1
  systemModulePermissionEnforcementActive: boolean
  systemModuleRetired: boolean
  systemModuleIcon: string
  systemModulePermissions: readonly SystemModulePermissionDeclaration[]
}

export interface SystemModuleGroupDeclaration {
  key: string
  name: string
  order: number
  icon: string
  modules: readonly SystemModuleDeclaration[]
}

/**
 * Entrada de la vista plana `SYSTEM_MODULES`: la declaración más la clave de su
 * grupo (`null` si el módulo va suelto). Es lo que reciben la siembra y
 * `permissions:check-consistency`.
 */
export interface FlatSystemModuleDeclaration extends SystemModuleDeclaration {
  systemModuleGroupKey: string | null
}

/**
 * Módulos cuyas acciones se enumeran en un catálogo tipado: el gate de
 * permisos y el árbol de permisos de sesión los leen de ahí. Sus permisos se
 * derivan de ese catálogo, nunca se copian.
 */
export const SYSTEM_MODULE_ACTION_CATALOGS = {
  'employees': EMPLOYEES_PERMISSION_CATALOG,
  'positions': POSITIONS_PERMISSION_CATALOG,
  'employees-attendance-monitor': ATTENDANCE_MONITOR_PERMISSION_CATALOG,
  'biometric-devices': ACCESS_POINT_PERMISSION_CATALOG,
} as const satisfies Record<string, readonly ActionCatalogEntry<string>[]>

/** Las acciones con `exemption` son apartados documentales: no tienen fila en BD. */
function permissionsFromActionCatalog(
  actions: readonly ActionCatalogEntry<string>[]
): SystemModulePermissionDeclaration[] {
  return actions
    .filter((action) => !action.exemption)
    .map((action) => ({
      systemPermissionName: action.displayName,
      systemPermissionSlug: action.slug,
    }))
}

export const SYSTEM_MODULES_UNGROUPED = [
  {
    systemModuleName: 'Monitor de asistencia',
    systemModuleSlug: 'employees-attendance-monitor',
    systemModuleDescription: '',
    systemModules: 1,
    systemModulePath: '/employees-attendance-monitor',
    systemModuleOrder: 1,
    systemModuleActive: 1,
    systemModulePermissionEnforcementActive: true,
    systemModuleRetired: false,
    systemModuleIcon:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M7 12a5 5 0 1 0 5 -5"/><path d="M6.29 18.957a9 9 0 1 0 5.71 -15.957"/></svg>',
    systemModulePermissions: permissionsFromActionCatalog(ATTENDANCE_MONITOR_PERMISSION_CATALOG),
  },
  {
    systemModuleName: 'Empleados',
    systemModuleSlug: 'employees',
    systemModuleDescription: '',
    systemModules: 1,
    systemModulePath: '/employees',
    systemModuleOrder: 2,
    systemModuleActive: 1,
    systemModulePermissionEnforcementActive: true,
    systemModuleRetired: false,
    systemModuleIcon:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/></svg>',
    systemModulePermissions: permissionsFromActionCatalog(EMPLOYEES_PERMISSION_CATALOG),
  },
  {
    systemModuleName: 'Calendario',
    systemModuleSlug: 'calendar',
    systemModuleDescription: '',
    systemModules: 1,
    systemModulePath: '/calendar',
    systemModuleOrder: 3,
    systemModuleActive: 1,
    systemModulePermissionEnforcementActive: true,
    systemModuleRetired: false,
    systemModuleIcon:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/><path d="M7 14h.013"/><path d="M10.01 14h.005"/><path d="M13.01 14h.005"/><path d="M16.015 14h.005"/><path d="M13.015 17h.005"/><path d="M7.01 17h.005"/><path d="M10.01 17h.005"/></svg>',
    // Las capas de cumpleaños, aniversarios y vacaciones no tienen permiso
    // propio aquí: sus endpoints exigen permisos del módulo Empleados
    // (`read` y `tab-trabajo-read`). El calendario solo administra festividades.
    systemModulePermissions: [
      { systemPermissionName: 'Acceder al calendario', systemPermissionSlug: 'read' },
      { systemPermissionName: 'Crear festividades', systemPermissionSlug: 'create' },
      { systemPermissionName: 'Editar festividades', systemPermissionSlug: 'update' },
      { systemPermissionName: 'Eliminar festividades', systemPermissionSlug: 'delete' },
    ],
  },
  {
    systemModuleName: 'Matriz de vencimientos',
    systemModuleSlug: 'documents-expiration-matrix',
    systemModuleDescription: '',
    systemModules: 1,
    systemModulePath: '/documents-expiration-matrix',
    systemModuleOrder: 4,
    systemModuleActive: 1,
    systemModulePermissionEnforcementActive: true,
    systemModuleRetired: false,
    systemModuleIcon:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 16v-4a4 4 0 0 1 8 0v4"/><path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7"/><path d="M6 16m0 1a1 1 0 0 1 1 -1h10a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1z"/></svg>',
    // `read` lo exige el API en los dos vencimientos exclusivos de la matriz
    // (expediente de la empresa y folio REPSE). Las tarjetas de expediente y
    // certificaciones de empleados cuelgan de las pestañas de Empleados.
    systemModulePermissions: [
      { systemPermissionName: 'Acceder a la matriz de vencimientos', systemPermissionSlug: 'read' },
    ],
  },
  {
    systemModuleName: 'Avisos y noticias',
    systemModuleSlug: 'notices',
    systemModuleDescription: '',
    systemModules: 1,
    systemModulePath: '/notices',
    systemModuleOrder: 5,
    systemModuleActive: 1,
    systemModulePermissionEnforcementActive: true,
    systemModuleRetired: false,
    systemModuleIcon:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a3 3 0 0 1 0 6"/><path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5"/><path d="M12 8h0l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"/></svg>',
    systemModulePermissions: [
      { systemPermissionName: 'Acceder a avisos y noticias', systemPermissionSlug: 'read' },
      { systemPermissionName: 'Crear avisos', systemPermissionSlug: 'create' },
      { systemPermissionName: 'Editar avisos', systemPermissionSlug: 'update' },
      { systemPermissionName: 'Eliminar avisos', systemPermissionSlug: 'delete' },
    ],
  },
  {
    systemModuleName: 'Solicitudes de permisos',
    systemModuleSlug: 'exception-requests',
    systemModuleDescription: '',
    systemModules: 1,
    systemModulePath: '/exception-requests',
    systemModuleOrder: 6,
    systemModuleActive: 1,
    systemModulePermissionEnforcementActive: false,
    systemModuleRetired: false,
    systemModuleIcon:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21h-6a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v4.5"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/><path d="M19 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M22 22a2 2 0 0 0 -2 -2h-2a2 2 0 0 0 -2 2"/></svg>',
    systemModulePermissions: [
      { systemPermissionName: 'Acceder a solicitudes de permisos', systemPermissionSlug: 'read' },
      { systemPermissionName: 'Crear solicitudes de permisos', systemPermissionSlug: 'create' },
      { systemPermissionName: 'Editar solicitudes de permisos', systemPermissionSlug: 'update' },
      { systemPermissionName: 'Eliminar solicitudes de permisos', systemPermissionSlug: 'delete' },
    ],
  },
] as const satisfies readonly SystemModuleDeclaration[]

export const SYSTEM_MODULES_GROUPED = [
  {
    key: 'empresa',
    name: 'Empresa',
    order: 10,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l18 0"/><path d="M9 8l1 0"/><path d="M9 12l1 0"/><path d="M9 16l1 0"/><path d="M14 8l1 0"/><path d="M14 12l1 0"/><path d="M14 16l1 0"/><path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16"/></svg>',
    modules: [
      {
        systemModuleName: 'Bajas de personal',
        systemModuleSlug: 'employee-offboardings',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/employee-offboardings',
        systemModuleOrder: 1,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4c.342 0 .674 .043 .99 .124"/><path d="M19 16v6"/><path d="M22 19l-3 3l-3 -3"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a bajas de personal', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear bajas de personal', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar bajas de personal', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Eliminar bajas de personal', systemPermissionSlug: 'delete' },
        ],
      },
      {
        systemModuleName: 'Usuarios',
        systemModuleSlug: 'users',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/users',
        systemModuleOrder: 2,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v4"/><path d="M10 20l4 -2"/><path d="M10 18l4 2"/><path d="M5 17v4"/><path d="M3 20l4 -2"/><path d="M3 18l4 2"/><path d="M19 17v4"/><path d="M17 20l4 -2"/><path d="M17 18l4 2"/><path d="M9 6a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M7 14a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a usuarios', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear usuarios', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar usuarios', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Eliminar usuarios', systemPermissionSlug: 'delete' },
        ],
      },
      {
        systemModuleName: 'Turnos',
        systemModuleSlug: 'shifts',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/shifts',
        systemModuleOrder: 3,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 0 -9.002 9"/><path d="M19.001 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M19.001 15.5v1.5"/><path d="M19.001 21v1.5"/><path d="M22.032 17.25l-1.299 .75"/><path d="M17.27 20l-1.3 .75"/><path d="M15.97 17.25l1.3 .75"/><path d="M20.733 20l1.3 .75"/><path d="M12 7v5l2 2"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a turnos', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear turnos', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar turnos', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Eliminar turnos', systemPermissionSlug: 'delete' },
        ],
      },
      {
        systemModuleName: 'Sucursales',
        systemModuleSlug: 'branch-offices',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/branch-offices',
        systemModuleOrder: 4,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-15c0 -1 1 -2 2 -2h5c1 0 2 1 2 2v15"/><path d="M16 8h2c1 0 2 1 2 2v11"/><path d="M3 21h18"/><path d="M10 12v0"/><path d="M10 16v0"/><path d="M10 8v0"/><path d="M7 12v0"/><path d="M7 16v0"/><path d="M7 8v0"/><path d="M17 12v0"/><path d="M17 16v0"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a sucursales', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear sucursales', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar sucursales', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Eliminar sucursales', systemPermissionSlug: 'delete' },
        ],
      },
      {
        systemModuleName: 'Zonas de asistencia remota',
        systemModuleSlug: 'zones',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/zones',
        systemModuleOrder: 5,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18.5l-3 -1.5l-6 3v-13l6 -3l6 3l6 -3v8"/><path d="M9 4v13"/><path d="M15 7v6.5"/><path d="M19.001 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M19.001 15.5v1.5"/><path d="M19.001 21v1.5"/><path d="M22.032 17.25l-1.299 .75"/><path d="M17.27 20l-1.3 .75"/><path d="M15.97 17.25l1.3 .75"/><path d="M20.733 20l1.3 .75"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a zonas de asistencia remota',
            systemPermissionSlug: 'read',
          },
          {
            systemPermissionName: 'Crear zonas de asistencia remota',
            systemPermissionSlug: 'create',
          },
          {
            systemPermissionName: 'Editar zonas de asistencia remota',
            systemPermissionSlug: 'update',
          },
          {
            systemPermissionName: 'Eliminar zonas de asistencia remota',
            systemPermissionSlug: 'delete',
          },
        ],
      },
      {
        systemModuleName: 'Teletrabajadores',
        systemModuleSlug: 'telework-workers',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/telework-workers',
        systemModuleOrder: 6,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19.03 17.818a3 3 0 0 0 1.97 -2.818v-8a3 3 0 0 0 -3 -3h-12a3 3 0 0 0 -3 3v8c0 1.317 .85 2.436 2.03 2.84"/><path d="M10 14a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M8 21a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a teletrabajadores', systemPermissionSlug: 'read' },
        ],
      },
      {
        systemModuleName: 'Activos e insumos',
        systemModuleSlug: 'supplies',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/supplies',
        systemModuleOrder: 7,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h4l13 -13a1.5 1.5 0 0 0 -4 -4l-13 13v4"/><path d="M14.5 5.5l4 4"/><path d="M12 8l-5 -5l-4 4l5 5"/><path d="M7 8l-1.5 1.5"/><path d="M16 12l5 5l-4 4l-5 -5"/><path d="M16 17l-1.5 1.5"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a activos e insumos', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear activos e insumos', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar activos e insumos', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Eliminar activos e insumos', systemPermissionSlug: 'delete' },
        ],
      },
      {
        systemModuleName: 'Eventos traumáticos',
        systemModuleSlug: 'traumatic-event-reports',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/traumatic-event-reports',
        systemModuleOrder: 8,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19h-10a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v3.5"/><path d="M19 16v3"/><path d="M19 22v.01"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a eventos traumáticos', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear eventos traumáticos', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar eventos traumáticos', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Eliminar eventos traumáticos', systemPermissionSlug: 'delete' },
        ],
      },
      {
        systemModuleName: 'Organigrama',
        systemModuleSlug: 'organization-chart',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/organization-chart',
        systemModuleOrder: 9,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z"/><path d="M15 15m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z"/><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z"/><path d="M6 15v-1a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v1"/><path d="M12 9l0 3"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder al organigrama', systemPermissionSlug: 'read' },
          {
            systemPermissionName: 'Crear departamentos y puestos en el organigrama',
            systemPermissionSlug: 'create',
          },
          {
            systemPermissionName: 'Editar departamentos y puestos del organigrama',
            systemPermissionSlug: 'update',
          },
          {
            systemPermissionName: 'Eliminar departamentos y puestos del organigrama',
            systemPermissionSlug: 'delete',
          },
        ],
      },
      {
        systemModuleName: 'Aplicabilidad',
        systemModuleSlug: 'questionnaire-applicability',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/questionnaire-applicability',
        systemModuleOrder: 10,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/><path d="M4 14l8 -3l8 3"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a la aplicabilidad de cuestionarios',
            systemPermissionSlug: 'read',
          },
        ],
      },
      {
        systemModuleName: 'Aplicaciones de cuestionario',
        systemModuleSlug: 'questionnaire-applications',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/questionnaire-applications',
        systemModuleOrder: 11,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2"/><path d="M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2"/><path d="M9 12l.01 0"/><path d="M13 12l2 0"/><path d="M9 16l.01 0"/><path d="M13 16l2 0"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a aplicaciones de cuestionario',
            systemPermissionSlug: 'read',
          },
          {
            systemPermissionName: 'Gestionar aplicaciones y respuestas de cuestionario',
            systemPermissionSlug: 'write',
          },
        ],
      },
      {
        systemModuleName: 'Resultados de la evaluación',
        systemModuleSlug: 'questionnaire-tabulation',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/questionnaire-tabulation',
        systemModuleOrder: 12,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2"/><path d="M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2"/><path d="M9 17v-5"/><path d="M12 17v-1"/><path d="M15 17v-3"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a resultados de la evaluación',
            systemPermissionSlug: 'read',
          },
          {
            systemPermissionName: 'Calcular resultados de la evaluación',
            systemPermissionSlug: 'write',
          },
        ],
      },
      {
        systemModuleName: 'Programa de atención',
        systemModuleSlug: 'attention-program',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/attention-program',
        systemModuleOrder: 13,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5l1.5 1.5l2.5 -2.5"/><path d="M3.5 11.5l1.5 1.5l2.5 -2.5"/><path d="M3.5 17.5l1.5 1.5l2.5 -2.5"/><path d="M11 6l9 0"/><path d="M11 12l9 0"/><path d="M11 18l9 0"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder al programa de atención', systemPermissionSlug: 'read' },
          {
            systemPermissionName: 'Gestionar el programa de atención',
            systemPermissionSlug: 'write',
          },
        ],
      },
      {
        systemModuleName: 'Buzón de quejas',
        systemModuleSlug: 'complaints',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/complaints',
        systemModuleOrder: 14,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 21v-6.5a3.5 3.5 0 0 0 -7 0v6.5h18v-6a4 4 0 0 0 -4 -4h-10.5"/><path d="M12 11v-8h4l2 2l-2 2h-4"/><path d="M6 15h1"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder al buzón de quejas', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Gestionar quejas', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Generar reporte de quejas', systemPermissionSlug: 'report' },
        ],
      },
      {
        systemModuleName: 'Difusión de resultados',
        systemModuleSlug: 'disclosure',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/disclosure',
        systemModuleOrder: 15,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6"/><path d="M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10"/><path d="M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14"/><path d="M4 20h14"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a la difusión de resultados',
            systemPermissionSlug: 'read',
          },
          {
            systemPermissionName: 'Consultar resultados de todos los centros de trabajo',
            systemPermissionSlug: 'read-all',
          },
        ],
      },
      {
        systemModuleName: 'Registro auditable',
        systemModuleSlug: 'traumatic-event-reports-registry',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/traumatic-event-reports-registry',
        systemModuleOrder: 16,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: false,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 8v-3a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5"/><path d="M3 14a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M4.5 17l-1.5 5l3 -1.5l3 1.5l-1.5 -5"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder al registro auditable de eventos traumáticos',
            systemPermissionSlug: 'read',
          },
        ],
      },
      {
        systemModuleName: 'Bitácora de lactancia',
        systemModuleSlug: 'employee-lactation-periods',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/employee-lactation-periods',
        systemModuleOrder: 97,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 4v16h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12z"/><path d="M19 16h-12a2 2 0 0 0 -2 2"/><path d="M9 8h6"/></svg>',
        // `read` lo exige el API en el reporte de cumplimiento y su PDF. Los
        // periodos, conflictos y evidencias de la ficha del empleado cuelgan
        // de las pestañas de Empleados (`tab-periodos-lactancia-*`).
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a la bitácora de lactancia',
            systemPermissionSlug: 'read',
          },
        ],
      },
      {
        systemModuleName: 'Bitácora de accesos a datos sensibles',
        systemModuleSlug: 'sensitive-data-access-log',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/sensitive-data-access-log',
        systemModuleOrder: 98,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 4v16h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12z"/><path d="M19 16h-12a2 2 0 0 0 -2 2"/><path d="M9 8h6"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a la bitácora de accesos a datos sensibles',
            systemPermissionSlug: 'read',
          },
        ],
      },
      {
        systemModuleName: 'Ajustes Generales',
        systemModuleSlug: 'system-settings',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/system-settings',
        systemModuleOrder: 99,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h9"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M5 21v-16c0 -.53 .211 -1.039 .586 -1.414c.375 -.375 .884 -.586 1.414 -.586h10c.53 0 1.039 .211 1.414 .586c.375 .375 .586 .884 .586 1.414v7"/><path d="M16 18c0 .53 .211 1.039 .586 1.414c.375 .375 .884 .586 1.414 .586c.53 0 1.039 -.211 1.414 -.586c.375 -.375 .586 -.884 .586 -1.414c0 -.53 -.211 -1.039 -.586 -1.414c-.375 -.375 -.884 -.586 -1.414 -.586c-.53 0 -1.039 .211 -1.414 .586c-.375 .375 -.586 .884 -.586 1.414z"/><path d="M18 14.5v1.5"/><path d="M18 20v1.5"/><path d="M21.032 16.25l-1.299 .75"/><path d="M16.27 19l-1.3 .75"/><path d="M14.97 16.25l1.3 .75"/><path d="M19.733 19l1.3 .75"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a ajustes generales', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear ajustes generales', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar ajustes generales', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Eliminar ajustes generales', systemPermissionSlug: 'delete' },
        ],
      },
      {
        systemModuleName: 'Puestos',
        systemModuleSlug: 'positions',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '#positions',
        systemModuleOrder: 0,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -9"/><path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2"/><path d="M12 12l0 .01"/><path d="M3 13a20 20 0 0 0 18 0"/></svg>',
        systemModulePermissions: permissionsFromActionCatalog(POSITIONS_PERMISSION_CATALOG),
      },
      {
        systemModuleName: 'Festividades',
        systemModuleSlug: 'holidays',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/holidays',
        systemModuleOrder: 0,
        systemModuleActive: 0,
        systemModulePermissionEnforcementActive: false,
        systemModuleRetired: true,
        systemModuleIcon: '',
        systemModulePermissions: [],
      },
      {
        systemModuleName: 'Cumpleaños',
        systemModuleSlug: 'birthdays-calendar',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/birthdays-calendar',
        systemModuleOrder: 0,
        systemModuleActive: 0,
        systemModulePermissionEnforcementActive: false,
        systemModuleRetired: true,
        systemModuleIcon: '',
        systemModulePermissions: [],
      },
      {
        systemModuleName: 'Vacaciones',
        systemModuleSlug: 'vacations-calendar',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/vacations-calendar',
        systemModuleOrder: 0,
        systemModuleActive: 0,
        systemModulePermissionEnforcementActive: false,
        systemModuleRetired: true,
        systemModuleIcon: '',
        systemModulePermissions: [],
      },
      {
        systemModuleName: 'Aniversarios',
        systemModuleSlug: 'work-anniversaries-calendar',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/work-anniversaries-calendar',
        systemModuleOrder: 0,
        systemModuleActive: 0,
        systemModulePermissionEnforcementActive: false,
        systemModuleRetired: true,
        systemModuleIcon: '',
        systemModulePermissions: [],
      },
      {
        systemModuleName: 'Historial de permisos',
        systemModuleSlug: 'permissions-history',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/permissions-history',
        systemModuleOrder: 0,
        systemModuleActive: 0,
        systemModulePermissionEnforcementActive: false,
        systemModuleRetired: true,
        systemModuleIcon: '',
        systemModulePermissions: [],
      },
      {
        systemModuleName: 'Tipos de expediente',
        systemModuleSlug: 'proceeding-file-types',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/proceeding-file-types',
        systemModuleOrder: 0,
        systemModuleActive: 0,
        systemModulePermissionEnforcementActive: false,
        systemModuleRetired: true,
        systemModuleIcon: '',
        systemModulePermissions: [],
      },
    ],
  },
  {
    key: 'repses',
    name: 'REPSES',
    order: 20,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9l5 5v7h-5v-4m0 4h-5v-7l5 -5m1 1v-6a1 1 0 0 1 1 -1h10a1 1 0 0 1 1 1v17h-8"/><path d="M13 7l0 .01"/><path d="M17 7l0 .01"/><path d="M17 11l0 .01"/><path d="M17 15l0 .01"/></svg>',
    modules: [
      {
        systemModuleName: 'Servicios REPSE',
        systemModuleSlug: 'repse-registrations',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/repse',
        systemModuleOrder: 1,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.5l-3 1.5l8 4l8 -4l-3 -1.5"/><path d="M4 15l8 4l8 -4"/><path d="M12 11v-7"/><path d="M9 7l3 -3l3 3"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a servicios REPSE', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear servicios REPSE', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar servicios REPSE', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Eliminar servicios REPSE', systemPermissionSlug: 'delete' },
          {
            systemPermissionName: 'Gestión completa de servicios REPSE',
            systemPermissionSlug: 'gestion',
          },
        ],
      },
      {
        systemModuleName: 'Proveedores REPSE',
        systemModuleSlug: 'repse-providers',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/repse-providers',
        systemModuleOrder: 2,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10l-2 1l8 4l8 -4l-2 -1"/><path d="M4 15l8 4l8 -4"/><path d="M12 4v7"/><path d="M15 8l-3 3l-3 -3"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a proveedores REPSE', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear proveedores REPSE', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar proveedores REPSE', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Eliminar proveedores REPSE', systemPermissionSlug: 'delete' },
          {
            systemPermissionName: 'Gestión completa de proveedores REPSE',
            systemPermissionSlug: 'gestion',
          },
        ],
      },
    ],
  },
  {
    key: 'desarrollo-organizacional',
    name: 'Desarrollo Organizacional',
    order: 30,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19l4 -6l4 2l4 -5l4 4l0 5l-16 0"/><path d="M4 12l3 -4l4 2l5 -6l4 4"/></svg>',
    modules: [
      {
        systemModuleName: 'Parámetros de evaluación',
        systemModuleSlug: 'assessment-templates',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/assessment-templates',
        systemModuleOrder: 1,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"/><path d="M12 10l0 4"/><path d="M10 12l4 0"/><path d="M10 17l4 0"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a parámetros de evaluación',
            systemPermissionSlug: 'read',
          },
          {
            systemPermissionName: 'Crear parámetros de evaluación',
            systemPermissionSlug: 'create',
          },
          {
            systemPermissionName: 'Editar parámetros de evaluación',
            systemPermissionSlug: 'update',
          },
          {
            systemPermissionName: 'Eliminar parámetros de evaluación',
            systemPermissionSlug: 'delete',
          },
          {
            systemPermissionName: 'Activar o desactivar parámetros de evaluación',
            systemPermissionSlug: 'toggle-status',
          },
        ],
      },
      {
        systemModuleName: 'Matriz de competencias',
        systemModuleSlug: 'skills-matrix',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/skills-matrix',
        systemModuleOrder: 2,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: false,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18v-6h-18v18h6v-18"/><path d="M3 15h12v-12"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a la matriz de competencias',
            systemPermissionSlug: 'read',
          },
        ],
      },
      {
        systemModuleName: 'Matriz 9 Box',
        systemModuleSlug: 'matrix-9-box',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/matrix-9-box',
        systemModuleOrder: 3,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: false,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 22.5a4.75 4.75 0 0 1 3.5 -3.5a4.75 4.75 0 0 1 -3.5 -3.5a4.75 4.75 0 0 1 -3.5 3.5a4.75 4.75 0 0 1 3.5 3.5"/><path d="M12 21h-7a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v7"/><path d="M3 10h18"/><path d="M10 3v18"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a la matriz 9 Box', systemPermissionSlug: 'read' },
        ],
      },
      {
        systemModuleName: 'Catálogo de certificaciones',
        systemModuleSlug: 'certifications',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/certifications',
        systemModuleOrder: 4,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 8v-3a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5"/><path d="M6 14m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M4.5 17l-1.5 5l3 -1.5l3 1.5l-1.5 -5"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder al catálogo de certificaciones',
            systemPermissionSlug: 'read',
          },
          { systemPermissionName: 'Crear certificaciones', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar certificaciones', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Eliminar certificaciones', systemPermissionSlug: 'delete' },
        ],
      },
      {
        systemModuleName: 'Competencias',
        systemModuleSlug: 'competencies',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/competencies',
        systemModuleOrder: 5,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 1 0 12 0a6 6 0 1 0 -12 0"/><path d="M12 15l3.4 5.89l1.598 -3.233l3.598 .232l-3.4 -5.889"/><path d="M6.802 12l-3.4 5.89l3.598 -.233l1.598 3.232l3.4 -5.889"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a competencias', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear competencias', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar competencias', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Eliminar competencias', systemPermissionSlug: 'delete' },
        ],
      },
      {
        systemModuleName: 'Catálogo de rutas de carrera',
        systemModuleSlug: 'career-path-templates',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/career-path-templates',
        systemModuleOrder: 6,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: false,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4"/><path d="M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder al catálogo de rutas de carrera',
            systemPermissionSlug: 'read',
          },
        ],
      },
      {
        systemModuleName: 'Bandeja de rutas de carrera',
        systemModuleSlug: 'hr-career-path',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/hr-career-path',
        systemModuleOrder: 7,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: false,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"/><path d="M4 13h3l3 3h4l3 -3h3"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a la bandeja de rutas de carrera',
            systemPermissionSlug: 'read',
          },
        ],
      },
    ],
  },
  {
    key: 'ajustes-y-configuracion',
    name: 'Ajustes y configuración',
    order: 40,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3c.568 1.933 .635 3.957 .223 5.89"/><path d="M19.001 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M19.001 15.5v1.5"/><path d="M19.001 21v1.5"/><path d="M22.032 17.25l-1.299 .75"/><path d="M17.27 20l-1.3 .75"/><path d="M15.97 17.25l1.3 .75"/><path d="M20.733 20l1.3 .75"/></svg>',
    modules: [
      {
        systemModuleName: 'Roles y permisos',
        systemModuleSlug: 'roles-and-permissions',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/roles-and-permissions',
        systemModuleOrder: 1,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/><path d="M12 11m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M12 12l0 2.5"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a roles y permisos', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear roles', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar roles y permisos', systemPermissionSlug: 'update' },
          { systemPermissionName: 'Eliminar roles', systemPermissionSlug: 'delete' },
        ],
      },
      {
        systemModuleName: 'Periodos vacacionales',
        systemModuleSlug: 'vacations',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/vacations',
        systemModuleOrder: 2,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M13 21h-7a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/><path d="M17 17v5"/><path d="M21 17v5"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a periodos vacacionales', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear periodos vacacionales', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar periodos vacacionales', systemPermissionSlug: 'update' },
          {
            systemPermissionName: 'Eliminar periodos vacacionales',
            systemPermissionSlug: 'delete',
          },
        ],
      },
      {
        systemModuleName: 'Simulador de reforma 40 hrs',
        systemModuleSlug: 'reform-simulation',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/reform-simulation',
        systemModuleOrder: 3,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 8.04l-12.122 12.124a2.857 2.857 0 1 1 -4.041 -4.04l12.122 -12.124"/><path d="M7 13h8"/><path d="M19 15l1.5 1.6a2 2 0 1 1 -3 0l1.5 -1.6z"/><path d="M15 3l6 6"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder al simulador de reforma 40 hrs',
            systemPermissionSlug: 'read',
          },
        ],
      },
      {
        systemModuleName: 'Políticas de jornada 40 hrs',
        systemModuleSlug: 'working-time-overrides',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/working-time-overrides',
        systemModuleOrder: 4,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1m3 0v18"/><path d="M13 8l2 0"/><path d="M13 12l2 0"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a políticas de jornada 40 hrs',
            systemPermissionSlug: 'read',
          },
          {
            systemPermissionName: 'Crear políticas de jornada 40 hrs',
            systemPermissionSlug: 'create',
          },
          {
            systemPermissionName: 'Editar políticas de jornada 40 hrs',
            systemPermissionSlug: 'update',
          },
          {
            systemPermissionName: 'Eliminar políticas de jornada 40 hrs',
            systemPermissionSlug: 'delete',
          },
        ],
      },
      {
        systemModuleName: 'Políticas de teletrabajo',
        systemModuleSlug: 'telework-policy',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/telework-policy',
        systemModuleOrder: 5,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1m3 0v18"/><path d="M13 8l2 0"/><path d="M13 12l2 0"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a políticas de teletrabajo',
            systemPermissionSlug: 'read',
          },
          {
            systemPermissionName: 'Crear políticas de teletrabajo',
            systemPermissionSlug: 'create',
          },
          {
            systemPermissionName: 'Editar políticas de teletrabajo',
            systemPermissionSlug: 'update',
          },
          {
            systemPermissionName: 'Eliminar políticas de teletrabajo',
            systemPermissionSlug: 'delete',
          },
          {
            systemPermissionName: 'Gestión completa de políticas de teletrabajo',
            systemPermissionSlug: 'gestion',
          },
        ],
      },
      {
        systemModuleName: 'Políticas de retención de datos',
        systemModuleSlug: 'retention-policy',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/retention-policy',
        systemModuleOrder: 6,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1m3 0v18"/><path d="M13 8l2 0"/><path d="M13 12l2 0"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a políticas de retención de datos',
            systemPermissionSlug: 'read',
          },
          {
            systemPermissionName: 'Editar políticas de retención de datos',
            systemPermissionSlug: 'write',
          },
        ],
      },
      {
        systemModuleName: 'Dispositivos biométricos',
        systemModuleSlug: 'biometric-devices',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/biometric-devices',
        systemModuleOrder: 7,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 21h-6.5a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v7"/><path d="M12 16a1 1 0 0 0 0 2"/><path d="M21.121 20.121a3 3 0 1 0 -4.242 0c.418 .419 1.125 1.045 2.121 1.879c1.051 -.89 1.759 -1.516 2.121 -1.879z"/><path d="M19 18v.01"/></svg>',
        systemModulePermissions: permissionsFromActionCatalog(ACCESS_POINT_PERMISSION_CATALOG),
      },
      {
        systemModuleName: 'Documentos legales',
        systemModuleSlug: 'legal-documents',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/legal-documents',
        systemModuleOrder: 8,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/><path d="M9 9l1 0"/><path d="M9 13l6 0"/><path d="M9 17l6 0"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a documentos legales', systemPermissionSlug: 'read' },
          { systemPermissionName: 'Crear documentos legales', systemPermissionSlug: 'create' },
          { systemPermissionName: 'Editar documentos legales', systemPermissionSlug: 'update' },
          {
            systemPermissionName: 'Gestión completa de documentos legales',
            systemPermissionSlug: 'gestion',
          },
        ],
      },
      {
        systemModuleName: 'Evidencia de aceptaciones',
        systemModuleSlug: 'consent-evidence',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/consent-evidence',
        systemModuleOrder: 9,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: true,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06"/><path d="M15 19l2 2l4 -4"/></svg>',
        systemModulePermissions: [
          {
            systemPermissionName: 'Acceder a evidencia de aceptaciones',
            systemPermissionSlug: 'read',
          },
          {
            systemPermissionName: 'Revelar datos de evidencia de aceptaciones',
            systemPermissionSlug: 'reveal',
          },
        ],
      },
      {
        systemModuleName: 'Cobertura regulatoria',
        systemModuleSlug: 'regulatory-coverage',
        systemModuleDescription: '',
        systemModules: 1,
        systemModulePath: '/regulatory-coverage',
        systemModuleOrder: 10,
        systemModuleActive: 1,
        systemModulePermissionEnforcementActive: false,
        systemModuleRetired: false,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2"/><path d="M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2"/><path d="M9 14l2 2l4 -4"/></svg>',
        systemModulePermissions: [
          { systemPermissionName: 'Acceder a cobertura regulatoria', systemPermissionSlug: 'read' },
        ],
      },
    ],
  },
] as const satisfies readonly SystemModuleGroupDeclaration[]

/** Vista plana con la clave de grupo; la consumen los seeders y el catálogo derivado. */
export const SYSTEM_MODULES = [
  ...SYSTEM_MODULES_UNGROUPED.map((systemModule) => ({
    ...systemModule,
    systemModuleGroupKey: null,
  })),
  ...SYSTEM_MODULES_GROUPED.flatMap((systemModuleGroup) =>
    systemModuleGroup.modules.map((systemModule) => ({
      ...systemModule,
      systemModuleGroupKey: systemModuleGroup.key,
    }))
  ),
]
