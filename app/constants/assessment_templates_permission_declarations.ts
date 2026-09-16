import type { PermissionGateOptions } from '#constants/permission_gate'

const assessmentTemplatesStandard = (action: string): PermissionGateOptions => ({
  module: 'assessment-templates',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Parámetros de evaluación. Fuente única
 * que consumen `start/routes/assessment_template_routes.ts`,
 * `assessment_template_dimension_routes.ts` y
 * `position_assessment_profile_routes.ts`.
 *
 * Por qué estos verbos:
 *  - Dimensiones sueltas y reordenar dimensiones piden `update`: agregar,
 *    editar, quitar o reordenar una dimensión es editar la plantilla. `delete`
 *    queda para borrar la plantilla completa; sin esto, las rutas de
 *    dimensiones eran una puerta trasera que evitaba el control de edición.
 *  - Los perfiles por puesto (`position-assessment-profiles`) pertenecen a este
 *    módulo, no al Organigrama: su único escritor es el drawer "configurar
 *    puestos" de la pantalla de plantillas, que el backoffice habilita con
 *    `update` (`pages/assessment-templates/index.vue`, `canManage`). Alta,
 *    edición y baja del perfil piden `update` por la misma razón.
 *  - Las lecturas sin consumidor fuera de la pantalla (lista y detalle de
 *    plantillas, dimensiones y detalle de perfil) piden `read`: el backoffice
 *    no deja entrar a la pantalla sin ese permiso.
 *
 * Sin declaración a propósito:
 *  - `GET /api/position-assessment-profiles`: lo lee el formulario de
 *    assessments del empleado (módulo Empleados); pedir `read` de plantillas
 *    rompería esa pantalla a quien evalúa sin administrar plantillas.
 *  - `PATCH /api/assessment-templates/:id/status`: ya lo verifica el
 *    controller con `RoleService.hasAccess(..., 'toggle-status')`, que deja
 *    pasar a root y owner igual que el bypass standard. Montarle gate
 *    duplicaría la verificación y cambiaría la key de negativa que lee el
 *    backoffice (`sin-permiso`).
 */
export const ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS = {
  indexAssessmentTemplates: assessmentTemplatesStandard('read'),
  storeAssessmentTemplate: assessmentTemplatesStandard('create'),
  showAssessmentTemplate: assessmentTemplatesStandard('read'),
  updateAssessmentTemplate: assessmentTemplatesStandard('update'),
  reorderAssessmentTemplateDimensions: assessmentTemplatesStandard('update'),
  deleteAssessmentTemplate: assessmentTemplatesStandard('delete'),
  indexAssessmentTemplateDimensions: assessmentTemplatesStandard('read'),
  storeAssessmentTemplateDimension: assessmentTemplatesStandard('update'),
  showAssessmentTemplateDimension: assessmentTemplatesStandard('read'),
  updateAssessmentTemplateDimension: assessmentTemplatesStandard('update'),
  deleteAssessmentTemplateDimension: assessmentTemplatesStandard('update'),
  storePositionAssessmentProfile: assessmentTemplatesStandard('update'),
  showPositionAssessmentProfile: assessmentTemplatesStandard('read'),
  updatePositionAssessmentProfile: assessmentTemplatesStandard('update'),
  deletePositionAssessmentProfile: assessmentTemplatesStandard('update'),
} as const satisfies Record<string, PermissionGateOptions>
