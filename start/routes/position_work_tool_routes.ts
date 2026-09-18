import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ORGANIZATION_CHART_PERMISSION_DECLARATIONS } from '#constants/organization_chart_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/position_work_tool_controller.store')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.storePositionWorkTool))
    router
      .put('/:positionWorkToolId', '#controllers/position_work_tool_controller.update')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.updatePositionWorkTool))
    router
      .delete('/:positionWorkToolId', '#controllers/position_work_tool_controller.delete')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.deletePositionWorkTool))
    router
      .get('/distinct-names', '#controllers/position_work_tool_controller.getDistinctNames')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.distinctPositionWorkToolNames))
    router
      .get('/by-position/:positionId', '#controllers/position_work_tool_controller.getByPosition')
      .use(
        middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.indexPositionWorkToolsByPosition)
      )
  })
  .prefix('/api/position-work-tools')
  .use(middleware.auth())
  .use(middleware.businessScope())
