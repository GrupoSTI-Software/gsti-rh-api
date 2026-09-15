import type { PermissionGateOptions } from '#constants/permission_gate'

const shiftsStandard = (action: string): PermissionGateOptions => ({
  module: 'shifts',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Turnos. Fuente única que consumen las
 * rutas de `start/routes/shift_routes.ts`.
 *
 * El listado (`GET /api/shift`) y el detalle (`GET /api/shift/:id`) no se
 * declaran: los consumen la asignación y el cambio de turno en Empleados y las
 * cuotas de REPSE.
 *
 * `create` cubre también el turno temporal que nace desde el cambio de turno
 * del colaborador: el backoffice ya exige `shifts:create` para ese botón.
 *
 * Las dos consultas sin consumidor (`shift-department-position` y
 * `shift-for-employees`) se retiraron en lugar de quedarse protegidas: ningún
 * cliente las llamaba y `shift-for-employees` además corría sin corte de
 * empresa. Con eso se fue el hueco de aislamiento que el permiso no cerraba.
 */
export const SHIFTS_PERMISSION_DECLARATIONS = {
  storeShift: shiftsStandard('create'),
  updateShift: shiftsStandard('update'),
  destroyShift: shiftsStandard('delete'),
} as const satisfies Record<string, PermissionGateOptions>
