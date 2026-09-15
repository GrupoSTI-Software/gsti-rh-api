import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SUPPLIES_PERMISSION_DECLARATIONS } from '#constants/supplies_permission_declarations'

router
  .group(() => {
    router
      .get('/supply-value-histories', '#controllers/supply_value_histories_controller.index')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexSupplyValueHistories))
    router
      .post('/supply-value-histories', '#controllers/supply_value_histories_controller.store')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.storeSupplyValueHistory))
    router
      .get('/supply-value-histories/:id', '#controllers/supply_value_histories_controller.show')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showSupplyValueHistory))
    router
      .put('/supply-value-histories/:id', '#controllers/supply_value_histories_controller.update')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.updateSupplyValueHistory))
    router
      .delete('/supply-value-histories/:id', '#controllers/supply_value_histories_controller.destroy')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.destroySupplyValueHistory))
    router
      .get('/supplies/:supplyId/value-histories', '#controllers/supply_value_histories_controller.getBySupply')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexSupplyValueHistoriesBySupply))
    router
      .get('/supplies/:supplyId/value-histories/latest', '#controllers/supply_value_histories_controller.getLatestValue')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showLatestSupplyValueHistory))
  })
  .prefix('/api')
  .use(middleware.auth())
