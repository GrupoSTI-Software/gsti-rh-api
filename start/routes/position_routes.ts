import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ORGANIZATION_CHART_PERMISSION_DECLARATIONS } from '#constants/organization_chart_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/position_controller.store')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.storePosition))
    router
      .put('/:positionId', '#controllers/position_controller.update')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.updatePosition))
    router
      .delete('/:positionId', '#controllers/position_controller.delete')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.deletePosition))
    // Sin gate: catálogo de puestos de las plantillas y candidatos de plan de
    // carrera. Pedir organization-chart:read los rompería.
    router.get('/', '#controllers/position_controller.get')
  })
  .prefix('/api/positions')
  .use(middleware.auth())
  .use(middleware.businessScope())

router
  .group(() => {
    router
      .get('/:positionId', '#controllers/position_controller.show')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.showPosition))
    router
      .get('/get-pdf/:positionId', '#controllers/position_controller.getPdf')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.downloadPositionPdf))
    router
      .get('/get-excel/:positionId', '#controllers/position_controller.getExcel')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.downloadPositionExcel))
  })
  .prefix('/api/positions')
  .use(middleware.auth())
  .use(middleware.businessScope())

// Sin gate: el controlador ya verifica organization-chart:update con
// OrgChartMoveService.assertCanUpdateOrganizationChart.
router
  .group(() => {
    router.patch('/:positionId/move', '#controllers/position_controller.move')
  })
  .prefix('/api/positions')
  .use(middleware.auth())
  /**
   * Mismo caso que el `move` de departamentos: era el único handler sin corte de
   * empresa en este controlador.
   */
  .use(middleware.businessScope())
router
  .group(() => {
    router.post('/assign-shift/:positionId', '#controllers/position_controller.assignShift')
  })
  .prefix('/api/position')
  .use(middleware.auth())
  /**
   * Mismo caso que `assign-shift` de departamento: `Position`, `Employee` y
   * `Shift` componen el mixin y el contexto lo activa este middleware. Queda
   * pendiente aparte que la ruta tampoco monta `permissionGate`.
   */
  .use(middleware.businessScope())
