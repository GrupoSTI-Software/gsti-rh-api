import type { PermissionGateOptions } from '#constants/permission_gate'

const competenciesStandard = (action: string | readonly string[]): PermissionGateOptions => ({
  module: 'competencies',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Competencias. Fuente única que consumen
 * `start/routes/competency_routes.ts`, `business_unit_competency_level_routes.ts`,
 * `competency_descriptor_routes.ts` y `competency_bracket_routes.ts`.
 * Niveles, descriptores y rangos no tienen módulo propio: solo se administran
 * desde la pantalla de Competencias.
 *
 * Por qué estos verbos:
 *  - Editar un nivel (`PUT`) pide `update` estricto: el body lleva etiqueta y
 *    posición, así que con `create` o `delete` en OR un rol podría renombrar y
 *    reordenar todos los niveles de la empresa con una llamada directa. El
 *    backoffice pide `update` también para agregar o quitar niveles, porque
 *    ambos renumeran los demás y el guardado los manda como `PUT`.
 *  - Alta de descriptor o rango acepta `create` o `update`: el formulario los
 *    crea tanto al dar de alta una competencia como al editarla.
 *  - Edición y baja de descriptor o rango piden `update`: solo ocurren dentro
 *    de la edición de una competencia ya guardada; no es borrar la competencia.
 *  - Lecturas sin consumidor fuera de la pantalla (detalle de competencia,
 *    nivel, descriptor y rango; descriptores por competencia) piden `read`.
 *
 * Sin declaración a propósito (lecturas que consumen otras pantallas):
 *  - `GET /api/competencies`: catálogo del perfil del puesto en el Organigrama.
 *  - `GET /api/business-unit-competency-levels`: Matriz de competencias y
 *    evaluaciones del empleado.
 *  - `GET /api/competency-brackets/by-descriptor/:id`: evaluación de
 *    competencias del empleado.
 */
export const COMPETENCIES_PERMISSION_DECLARATIONS = {
  storeCompetency: competenciesStandard('create'),
  showCompetency: competenciesStandard('read'),
  updateCompetency: competenciesStandard('update'),
  deleteCompetency: competenciesStandard('delete'),
  storeBusinessUnitCompetencyLevel: competenciesStandard('create'),
  showBusinessUnitCompetencyLevel: competenciesStandard('read'),
  updateBusinessUnitCompetencyLevel: competenciesStandard('update'),
  deleteBusinessUnitCompetencyLevel: competenciesStandard('delete'),
  storeCompetencyDescriptor: competenciesStandard(['create', 'update']),
  showCompetencyDescriptor: competenciesStandard('read'),
  updateCompetencyDescriptor: competenciesStandard('update'),
  deleteCompetencyDescriptor: competenciesStandard('update'),
  indexCompetencyDescriptorsByCompetency: competenciesStandard('read'),
  storeCompetencyBracket: competenciesStandard(['create', 'update']),
  showCompetencyBracket: competenciesStandard('read'),
  updateCompetencyBracket: competenciesStandard('update'),
  deleteCompetencyBracket: competenciesStandard('update'),
} as const satisfies Record<string, PermissionGateOptions>
