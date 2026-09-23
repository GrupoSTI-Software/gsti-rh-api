import type { PermissionGateOptions } from '#constants/permission_gate'

const workingTimeOverridesStandard = (action: string): PermissionGateOptions => ({
  module: 'working-time-overrides',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Políticas de jornada 40 hrs
 * (`working-time-overrides`). Fuente única que consume
 * `app/modules/working-time-rules/overrides/overrides.routes.ts`.
 *
 * Los topes de jornada alteran horas extra y nómina: antes de este gate
 * cualquier usuario del tenant los creaba, editaba o borraba. El único
 * consumidor HTTP es la pantalla del módulo; los cálculos internos leen el
 * tope por servicio, sin pasar por la ruta.
 *
 * Quedan abiertas a propósito y por eso no se declaran aquí:
 *  - `GET /api/v1/working-time-rules/effective`: turnos del empleado validan
 *    horas contra el tope (`components/employeeShift`).
 *  - `GET /api/v1/working-time-rules/federal`: catálogo legal federal global,
 *    sin datos del tenant.
 *
 * Bypass `standard` (root y owner): ningún código vigente trata a
 * `super-administrador` como administrador de jornada.
 */
export const WORKING_TIME_OVERRIDES_PERMISSION_DECLARATIONS = {
  indexOverrides: workingTimeOverridesStandard('read'),
  storeOverride: workingTimeOverridesStandard('create'),
  updateOverride: workingTimeOverridesStandard('update'),
  destroyOverride: workingTimeOverridesStandard('delete'),
} as const satisfies Record<string, PermissionGateOptions>
