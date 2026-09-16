import type { PermissionGateOptions } from '#constants/permission_gate'

const calendarStandard = (action: string): PermissionGateOptions => ({
  module: 'calendar',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Calendario. Fuente única que consume
 * `start/routes/holiday_routes.ts`.
 *
 * La exportación a Excel y el detalle por id exigen `read`: solo los usa la
 * pantalla del calendario del backoffice, a la que ya no entra un rol sin
 * `read`. Sin el gate, cualquier sesión (también la de la app) leía una
 * festividad por id o descargaba el Excel del año.
 *
 * Quedan abiertas a propósito y por eso no se declaran aquí:
 *  - `GET /api/holidays`: la lista la consumen la PWA del colaborador y los
 *    cálculos de asistencia y nómina del backoffice, que no administran el
 *    calendario.
 *  - `GET /api/icons`: catálogo global de iconos, sin datos de la empresa.
 */
export const CALENDAR_PERMISSION_DECLARATIONS = {
  storeHoliday: calendarStandard('create'),
  showHoliday: calendarStandard('read'),
  exportHolidaysExcel: calendarStandard('read'),
  updateHoliday: calendarStandard('update'),
  destroyHoliday: calendarStandard('delete'),
} as const satisfies Record<string, PermissionGateOptions>
