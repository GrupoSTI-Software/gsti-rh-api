import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ORGANIZATION_CHART_PERMISSION_DECLARATIONS } from '#constants/organization_chart_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/position_kpi_controller.store')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.storePositionKpi))
    router
      .put('/:positionKpiId', '#controllers/position_kpi_controller.update')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.updatePositionKpi))
    router
      .delete('/:positionKpiId', '#controllers/position_kpi_controller.delete')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.deletePositionKpi))
    router
      .get('/distinct-names', '#controllers/position_kpi_controller.getDistinctNames')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.distinctPositionKpiNames))
    // Sin gate: Evaluaciones lee los KPIs del puesto del colaborador evaluado.
    router.get('/by-position/:positionId', '#controllers/position_kpi_controller.getByPosition')
  })
  .prefix('/api/position-kpis')
  .use(middleware.auth())
  .use(middleware.businessScope())
