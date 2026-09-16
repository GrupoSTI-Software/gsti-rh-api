import type { PermissionGateOptions } from '#constants/permission_gate'

const organizationChartExpanded = (action: string | readonly string[]): PermissionGateOptions => ({
  module: 'organization-chart',
  action,
  bypass: 'expanded',
})

/**
 * Declaraciones de permiso del módulo Organigrama. Fuente única que consumen
 * las rutas de departamentos, puestos, la liga departamento-puesto y el perfil
 * del puesto (funciones específicas, competencias, KPIs, herramientas,
 * certificaciones requeridas e historial de aprobación).
 *
 * Bypass `expanded` (root, owner y super-administrador): los servicios del
 * organigrama que ya verificaban permiso tratan a super-administrador como
 * administrador implícito (`OrgChartMoveService.ORG_CHART_ADMIN_SLUGS`,
 * `PositionLevelService.ORG_CHART_ADMIN_SLUGS`). Con `standard` el API le
 * daría a ese rol menos acceso en editar que el que ya tiene al mover nodos.
 *
 * No se declaran (lecturas que consumen otras pantallas):
 *  - `GET /api/departments`, `/get-only-with-employees`, `/:id/positions` y
 *    `/:id/get-rotation-index`: selects y filtros de Empleados, Calendario,
 *    Avisos, 9-box, Vacaciones, Excepciones y Cumpleaños.
 *  - `GET /api/positions`: plantillas y candidatos de plan de carrera.
 *  - `GET /api/position-kpis/by-position/:id`: Evaluaciones.
 *  - `GET /api/position-business-unit-competency-levels/by-position/:id`:
 *    Evaluaciones y Matriz de habilidades.
 *
 * Las demás lecturas piden `read`: su único consumidor vivo es la página del
 * organigrama, a la que el backoffice no deja entrar sin ese permiso.
 *
 * `PATCH /move` de departamentos y puestos no se declara: el controlador ya
 * verifica `update` con `OrgChartMoveService.assertCanUpdateOrganizationChart`.
 *
 * El historial de aprobación acepta `create` o `update`: el formulario del
 * puesto lo escribe al guardar tanto un puesto nuevo como uno existente.
 *
 * `sync-positions` pide `create`: solo crea ligas departamento-puesto que
 * faltan (`DepartmentPositionService.syncCreate`), igual que el alta de la liga.
 */
export const ORGANIZATION_CHART_PERMISSION_DECLARATIONS = {
  showOrganizationTree: organizationChartExpanded('read'),
  searchDepartments: organizationChartExpanded('read'),
  showDepartment: organizationChartExpanded('read'),
  storeDepartment: organizationChartExpanded('create'),
  syncDepartmentPositions: organizationChartExpanded('create'),
  updateDepartment: organizationChartExpanded('update'),
  deleteDepartment: organizationChartExpanded('delete'),
  forceDeleteDepartment: organizationChartExpanded('delete'),

  storePosition: organizationChartExpanded('create'),
  updatePosition: organizationChartExpanded('update'),
  deletePosition: organizationChartExpanded('delete'),
  showPosition: organizationChartExpanded('read'),
  downloadPositionPdf: organizationChartExpanded('read'),
  downloadPositionExcel: organizationChartExpanded('read'),

  storeDepartmentPosition: organizationChartExpanded('create'),
  updateDepartmentPosition: organizationChartExpanded('update'),
  deleteDepartmentPosition: organizationChartExpanded('delete'),
  deleteDepartmentPositionRelation: organizationChartExpanded('delete'),
  showDepartmentPosition: organizationChartExpanded('read'),

  storePositionKpi: organizationChartExpanded('create'),
  updatePositionKpi: organizationChartExpanded('update'),
  deletePositionKpi: organizationChartExpanded('delete'),
  distinctPositionKpiNames: organizationChartExpanded('read'),

  storePositionSpecificFunction: organizationChartExpanded('create'),
  updatePositionSpecificFunction: organizationChartExpanded('update'),
  deletePositionSpecificFunction: organizationChartExpanded('delete'),
  distinctPositionSpecificFunctionNames: organizationChartExpanded('read'),
  distinctPositionSpecificFunctionFrequencies: organizationChartExpanded('read'),
  indexPositionSpecificFunctionsByPosition: organizationChartExpanded('read'),

  storePositionWorkTool: organizationChartExpanded('create'),
  updatePositionWorkTool: organizationChartExpanded('update'),
  deletePositionWorkTool: organizationChartExpanded('delete'),
  distinctPositionWorkToolNames: organizationChartExpanded('read'),
  indexPositionWorkToolsByPosition: organizationChartExpanded('read'),

  storePositionCompetencyLevel: organizationChartExpanded('create'),
  updatePositionCompetencyLevel: organizationChartExpanded('update'),
  deletePositionCompetencyLevel: organizationChartExpanded('delete'),

  indexPositionCertificationRequirements: organizationChartExpanded('read'),
  storePositionCertificationRequirements: organizationChartExpanded('create'),
  destroyPositionCertificationRequirement: organizationChartExpanded('delete'),

  storePositionApprovalHistory: organizationChartExpanded(['create', 'update']),
  showLastPositionApprovalHistory: organizationChartExpanded('read'),
} as const satisfies Record<string, PermissionGateOptions>
