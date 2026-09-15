import type { PermissionGateOptions } from '#constants/permission_gate'

const shiftsStandard = (action: string): PermissionGateOptions => ({
  module: 'shifts',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Turnos. Fuente única que consumen las
 * rutas de `start/routes/shift_routes.ts` y `start/routes/shift_for_employees.ts`.
 *
 * El listado (`GET /api/shift`) y el detalle (`GET /api/shift/:id`) no se
 * declaran: los consumen la asignación y el cambio de turno en Empleados y las
 * cuotas de REPSE.
 *
 * `create` cubre también el turno temporal que nace desde el cambio de turno
 * del colaborador: el backoffice ya exige `shifts:create` para ese botón.
 *
 * Las dos consultas sin consumidor conocido (`shift-department-position` y
 * `shift-for-employees`) piden `read` en lugar de quedar abiertas: nadie las
 * usa y cerrarlas no rompe ninguna pantalla.
 */
export const SHIFTS_PERMISSION_DECLARATIONS = {
  storeShift: shiftsStandard('create'),
  searchShiftsByPositionDepartment: shiftsStandard('read'),
  updateShift: shiftsStandard('update'),
  destroyShift: shiftsStandard('delete'),
  indexShiftsForEmployees: shiftsStandard('read'),
} as const satisfies Record<string, PermissionGateOptions>
