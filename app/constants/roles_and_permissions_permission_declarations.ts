import type { PermissionGateOptions } from '#constants/permission_gate'

const rolesStandard = (action: string | readonly string[]): PermissionGateOptions => ({
  module: 'roles-and-permissions',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Roles y permisos
 * (`roles-and-permissions`). Fuente única que consumen las rutas de roles
 * (`start/routes/role_routes.ts`), las de plantillas de rol
 * (`start/routes/role_preset_routes.ts`) y las verificaciones secundarias de
 * `role_controller.ts`.
 *
 * Criterio por operación:
 *  - Alta de rol: `create`. Si el alta trae plantilla (`rolePresetSlug`), el
 *    controller exige además `update`: la plantilla concede permisos y un gate
 *    con lista es OR, no sirve para pedir los dos.
 *  - Edición de metadatos, asignación de permisos (`assign`, `assign-batch`) y
 *    vista previa o aplicación de plantilla: `update`.
 *  - Baja de rol: `delete` o `update`. El backoffice muestra el botón de borrar
 *    con `canUpdate` (`pages/roles-and-permissions/index.vue`); mientras no lo
 *    cambie a `canDelete`, pedir solo `delete` le daría 403 a quien hoy borra.
 *  - Detalle de rol, catálogo de plantillas y `has-access-department`: `read`.
 *    Solo los consume la pantalla de roles.
 *  - `readOtherRoleAccess`: `read`, lo aplica el controller cuando
 *    `has-access`, `get-access` o `get-access-by-module` piden la matriz de un
 *    rol distinto al de la sesión.
 *  - `indexRolesWithGrants`: `read`, lo evalúa el controller del listado sin
 *    responder. Sin él, el listado sale sin `roleSystemPermissions`: la matriz
 *    de todos los roles visibles no es dato de un select, y entregarla dejaba
 *    sin efecto a `readOtherRoleAccess` y al gate del detalle.
 *
 * Quedan sin gate a propósito y por eso no se declaran como ruta:
 *  - `GET /api/roles`: selects y filtros de Usuarios (id, nombre, slug); las
 *    concesiones de cada rol solo viajan con `indexRolesWithGrants`.
 *  - `has-access`, `get-access` y `get-access-by-module`: plomería de sesión
 *    del menú y del guard de cada pantalla; con gate, quien no administra
 *    roles se quedaría sin menú.
 *
 * Bypass `standard` (root y owner): son los dos roles a los que el backoffice
 * da acceso total a la pantalla; ningún código vigente trata a
 * `super-administrador` como administrador de roles.
 */
export const ROLES_AND_PERMISSIONS_PERMISSION_DECLARATIONS = {
  // Roles — start/routes/role_routes.ts
  showRole: rolesStandard('read'),
  storeRole: rolesStandard('create'),
  updateRole: rolesStandard('update'),
  destroyRole: rolesStandard(['delete', 'update']),
  assignRolePermissions: rolesStandard('update'),
  assignRolesPermissionsBatch: rolesStandard('update'),
  hasAccessDepartment: rolesStandard('read'),

  // Plantillas de rol — start/routes/role_preset_routes.ts
  indexRolePresets: rolesStandard('read'),
  previewRolePreset: rolesStandard('update'),
  applyRolePreset: rolesStandard('update'),

  // Verificaciones secundarias — app/controllers/role_controller.ts
  storeRoleWithPreset: rolesStandard('update'),
  readOtherRoleAccess: rolesStandard('read'),
  indexRolesWithGrants: rolesStandard('read'),
} as const satisfies Record<string, PermissionGateOptions>
