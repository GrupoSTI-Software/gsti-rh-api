import type { PermissionGateOptions } from '#constants/permission_gate'

const calendarStandard = (action: string): PermissionGateOptions => ({
  module: 'calendar',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Calendario. Fuente única que consumen
 * las rutas de festividades.
 *
 * Solo se protege la escritura: la consulta de festividades la usan también
 * la app del colaborador y el cálculo de asistencia, y ninguno de ellos tiene
 * por qué administrar el calendario.
 */
export const CALENDAR_PERMISSION_DECLARATIONS = {
  storeHoliday: calendarStandard('create'),
  updateHoliday: calendarStandard('update'),
  destroyHoliday: calendarStandard('delete'),
} as const satisfies Record<string, PermissionGateOptions>
