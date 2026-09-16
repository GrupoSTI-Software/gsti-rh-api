import type { PermissionGateOptions } from '#constants/permission_gate'

const registryStandard = (action: string): PermissionGateOptions => ({
  module: 'traumatic-event-reports-registry',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del Registro auditable de eventos traumáticos
 * (NOM-035 §5.8.c). Fuente única que consume
 * `start/routes/traumatic_event_report_routes.ts`.
 *
 * Por qué el módulo del registro y no el de reportes: el menú y el guard de
 * pantalla del backoffice ya protegían `/traumatic-event-reports-registry` con
 * este slug, pero el controller verificaba `traumatic-event-reports:read`. Un
 * rol con el registro y sin reportes abría la pantalla y recibía 403; uno con
 * reportes y sin registro no veía la pantalla, pero el API le entregaba el
 * registro completo. Ahora el API, el guard y el botón de PDF preguntan lo mismo.
 *
 * El PDF pide el mismo `read` que la lista: es la misma información más la
 * CURP, y la CURP sigue dependiendo aparte de `employees:export-sensitive-data`
 * (`PiiExportService`: sin ese permiso sale enmascarada; con él exige motivo y
 * deja asiento en la bitácora).
 *
 * Queda abierto a propósito y por eso no se declara aquí:
 *  - `GET /api/traumatic-event-types`: catálogo normativo de solo lectura que
 *    usan el formulario de reportes del backoffice y la app del colaborador
 *    para dar de alta su reporte; ninguno de los dos administra el registro.
 *
 * El resto de `/api/traumatic-event-reports` es del módulo
 * `traumatic-event-reports` y lo sigue verificando su controller.
 */
export const TRAUMATIC_EVENT_REPORTS_REGISTRY_PERMISSION_DECLARATIONS = {
  registry: registryStandard('read'),
  registryExport: registryStandard('read'),
} as const satisfies Record<string, PermissionGateOptions>
