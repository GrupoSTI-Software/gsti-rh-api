/* eslint-disable prettier/prettier */
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ORGANIZATION_CHART_PERMISSION_DECLARATIONS } from '#constants/organization_chart_permission_declarations'

router.group(() => {
  router
    .get('/organization', '#controllers/department_controller.getOrganization')
    .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.showOrganizationTree))
  router
    .get('/search', '#controllers/department_controller.getSearch')
    .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.searchDepartments))
  router
    .get('/:departmentId', '#controllers/department_controller.show')
    .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.showDepartment))
  router
    .post('/', '#controllers/department_controller.store')
    .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.storeDepartment))
  router
    .post('/sync-positions', '#controllers/department_controller.syncPositions')
    .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.syncDepartmentPositions))
  router
    .put('/:departmentId', '#controllers/department_controller.update')
    .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.updateDepartment))
  router
    .delete('/:departmentId', '#controllers/department_controller.delete')
    .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.deleteDepartment))
  router
    .delete('/:departmentId/force-delete', '#controllers/department_controller.forceDelete')
    .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.forceDeleteDepartment))
})
 .prefix('/api/departments')
 .use(middleware.auth())
 .use(middleware.businessScope())

// Sin gate: catálogos de departamentos y puestos que consumen los selects y
// filtros de Empleados, Calendario, Avisos, 9-box, Vacaciones, Excepciones y
// Cumpleaños. Pedir organization-chart:read los rompería.
router.group(() => {
  router.get('/', '#controllers/department_controller.getAll')
  router.get('/get-only-with-employees/', '#controllers/department_controller.getOnlyWithEmployees')
  router.get('/:departmentId/positions', '#controllers/department_controller.getPositions')
  router.get('/:departmentId/get-rotation-index', '#controllers/department_controller.getRotationIndex')
})
  .prefix('/api/departments')
  .use(middleware.auth())
  .use(middleware.businessScope())

// Sin gate: el controlador ya verifica organization-chart:update con
// OrgChartMoveService.assertCanUpdateOrganizationChart.
router
  .group(() => {
    router.patch('/:departmentId/move', '#controllers/department_controller.move')
  })
  .prefix('/api/departments')
  .use(middleware.auth())
  /**
   * `move` era el único handler de este controlador sin corte de empresa: sus
   * hermanos `update`, `delete` y `show` ya leen el scope. Sin contexto se podía
   * reorganizar el organigrama de otro cliente dentro de sí mismo.
   */
  .use(middleware.businessScope())

router.group(() => {
  router.post('/assign-shift/:departmentId', '#controllers/department_controller.assignShift')
})
.prefix('/api/department')
.use(middleware.auth())
/**
 * `Department`, `Employee` y `Shift` componen el mixin de empresa, así que con
 * el contexto activo el filtro se aplica solo. Sin él, este endpoint reescribía
 * el turno de todos los empleados de un departamento de otro cliente.
 *
 * Pendiente aparte: esta ruta tampoco monta `permissionGate`, así que hoy la
 * alcanza cualquier sesión. Cambiar eso es autorización, no aislamiento.
 */
.use(middleware.businessScope())
