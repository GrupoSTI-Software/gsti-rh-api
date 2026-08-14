import type { PermissionGateOptions } from '#constants/permission_gate'

const usersStandard = (action: string): PermissionGateOptions => ({
  module: 'users',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Usuarios (USRH1786736057519 E2).
 * Fuente única que consumen las rutas; no concede nada ni enciende la exigencia del módulo.
 */
export const USERS_PERMISSION_DECLARATIONS = {
  store: usersStandard('create'),
  update: usersStandard('update'),
  delete: usersStandard('delete'),
  show: usersStandard('read'),
} as const satisfies Record<string, PermissionGateOptions>
