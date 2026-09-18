import type { PermissionGateOptions } from '#constants/permission_gate'

const coverageReportExpanded = (action: string): PermissionGateOptions => ({
  module: 'repse-registrations',
  action,
  bypass: 'expanded',
})

/**
 * Declaraciones de permiso del reporte de cobertura REPSE. Fuente única que
 * consume `start/routes/repse_coverage_report_routes.ts`.
 *
 * Vivía como objeto escrito en el archivo de rutas y el contrato del catálogo
 * (`tests/unit/constants/system_modules_constant.spec.ts`) solo revisa los
 * `app/constants/*_permission_declarations.ts`: cumplía de casualidad. Aquí
 * queda bajo el mismo contrato que el resto de las declaraciones.
 *
 * El reporte y su exportación son lecturas del módulo de registros REPSE
 * (`read`). Bypass `expanded`: el código de REPSE ya trata a
 * `super-administrador` como administrador del dominio
 * (`app/helpers/compliance_repse_rbac.ts`, `assertComplianceRepsePermission`).
 */
export const REPSE_COVERAGE_REPORT_PERMISSION_DECLARATIONS = {
  showCoverageReport: coverageReportExpanded('read'),
  exportCoverageReport: coverageReportExpanded('read'),
} as const satisfies Record<string, PermissionGateOptions>
