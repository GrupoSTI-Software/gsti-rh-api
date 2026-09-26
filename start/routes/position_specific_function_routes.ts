import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ORGANIZATION_CHART_PERMISSION_DECLARATIONS } from '#constants/organization_chart_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/position_specific_function_controller.store')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.storePositionSpecificFunction))
    router
      .put('/:positionSpecificFunctionId', '#controllers/position_specific_function_controller.update')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.updatePositionSpecificFunction))
    router
      .delete('/:positionSpecificFunctionId', '#controllers/position_specific_function_controller.delete')
      .use(middleware.permissionGate(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.deletePositionSpecificFunction))
    router
      .get('/distinct-names', '#controllers/position_specific_function_controller.getDistinctNames')
      .use(
        middleware.permissionGate(
          ORGANIZATION_CHART_PERMISSION_DECLARATIONS.distinctPositionSpecificFunctionNames
        )
      )
    router
      .get('/distinct-frequencies', '#controllers/position_specific_function_controller.getDistinctFrequencies')
      .use(
        middleware.permissionGate(
          ORGANIZATION_CHART_PERMISSION_DECLARATIONS.distinctPositionSpecificFunctionFrequencies
        )
      )
    router
      .get('/by-position/:positionId', '#controllers/position_specific_function_controller.getByPosition')
      .use(
        middleware.permissionGate(
          ORGANIZATION_CHART_PERMISSION_DECLARATIONS.indexPositionSpecificFunctionsByPosition
        )
      )
  })
  .prefix('/api/position-specific-functions')
  .use(middleware.auth())
  .use(middleware.businessScope())
