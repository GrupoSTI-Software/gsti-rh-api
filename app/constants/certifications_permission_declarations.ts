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
 * `GET /api/certification-categories` pide `read`: su único consumidor es la
 * pantalla del catálogo (`pages/certifications/script.ts` del backoffice), que
 * ya exige ese permiso para abrirse. Ni el Organigrama, ni la PWA, ni la app
 * del colaborador lo leen, así que por la regla de lecturas de catálogo se
 * protege con el permiso del módulo.
 *
 * Sin declaración a propósito:
 *  - `GET /api/certifications`: lo usa el panel de certificaciones requeridas
 *    del Organigrama como lista del selector.
 */
export const CERTIFICATIONS_PERMISSION_DECLARATIONS = {
  indexCertificationCategories: certificationsStandard('read'),
  createCertification: certificationsStandard('create'),
  updateCertification: certificationsStandard('update'),
  deleteCertification: certificationsStandard('delete'),
} as const satisfies Record<string, PermissionGateOptions>
