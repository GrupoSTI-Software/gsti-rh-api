import type { PermissionGateOptions } from '#constants/permission_gate'

const certificationsStandard = (action: string): PermissionGateOptions => ({
  module: 'certifications',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Catálogo de certificaciones. Fuente
 * única que consume `start/routes/certifications_routes.ts`.
 *
 * Antes las escrituras del catálogo colgaban de Empleados
 * (`employees:tab-certificaciones-write/delete`) mientras la pantalla del
 * backoffice mostraba los botones por `certifications:create/update/delete`:
 * la casilla de roles de este módulo no decidía nada en el API. Los permisos de
 * la pestaña del empleado siguen gobernando solo la carga y baja de
 * cumplimientos (`employee_certification_upload_routes.ts`).
 *
 * Sin declaración a propósito:
 *  - `GET /api/certifications`: lo usa el panel de certificaciones requeridas
 *    del Organigrama como lista del selector.
 *  - `GET /api/certification-categories`: catálogo estático sembrado (0027),
 *    igual para todas las empresas y sin datos de ninguna. Hoy solo lo lee esta
 *    pantalla, pero cerrarlo no protege información.
 */
export const CERTIFICATIONS_PERMISSION_DECLARATIONS = {
  createCertification: certificationsStandard('create'),
  updateCertification: certificationsStandard('update'),
  deleteCertification: certificationsStandard('delete'),
} as const satisfies Record<string, PermissionGateOptions>
