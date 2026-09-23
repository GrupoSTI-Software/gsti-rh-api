import type { PermissionGateOptions } from '#constants/permission_gate'

const vacationsPlatformReserved = (action: string): PermissionGateOptions => ({
  module: 'vacations',
  action,
  bypass: 'platformReserved',
})

/**
 * Declaraciones de permiso del módulo Periodos vacacionales (`vacations`).
 * Fuente única que consume `start/routes/vacations_routes.ts`.
 *
 * Bypass `platformReserved` (solo root): `vacation_settings` no tiene columna
 * de empresa (`app/models/vacation_setting.ts`) y el listado no filtra por
 * tenant. La tabla de días por antigüedad es global y la consume el cálculo
 * de vacaciones de todas las empresas (`app/services/employee_vacation_service.ts`).
 * Con `standard`, el owner de cualquier empresa reescribiría la política de
 * todas las demás.
 *
 * Quedan abiertas a propósito y por eso no se declaran aquí: `GET /api/vacations`
 * (política de vacaciones del expediente del empleado,
 * `components/employeeVacationPolicy`) y `GET /api/vacations/:vacationSettingId`,
 * que expone el mismo dato que el listado abierto.
 */
export const VACATIONS_PERMISSION_DECLARATIONS = {
  storeVacationSetting: vacationsPlatformReserved('create'),
  updateVacationSetting: vacationsPlatformReserved('update'),
  destroyVacationSetting: vacationsPlatformReserved('delete'),
} as const satisfies Record<string, PermissionGateOptions>
