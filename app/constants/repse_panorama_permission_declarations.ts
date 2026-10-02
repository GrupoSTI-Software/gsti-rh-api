import type { PermissionGateOptions } from '#constants/permission_gate'

/**
 * Declaraciones de permiso del panorama REPSE. Fuente única que consume
 * `start/routes/repse_panorama_routes.ts`.
 *
 * El panorama es una lectura del módulo de registros REPSE (`read`), el mismo
 * permiso que el registro y el reporte de cobertura. Bypass `expanded`, igual
 * que `repse_coverage_report_permission_declarations.ts`: el código de REPSE
 * ya trata a `super-administrador` como administrador del dominio
 * (`app/helpers/compliance_repse_rbac.ts`).
 */
export const REPSE_PANORAMA_PERMISSION_DECLARATIONS = {
  showPanorama: {
    module: 'repse-registrations',
    action: 'read',
    bypass: 'expanded',
  },
} as const satisfies Record<string, PermissionGateOptions>
