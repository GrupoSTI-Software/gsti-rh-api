import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SUPPLIES_PERMISSION_DECLARATIONS } from '#constants/supplies_permission_declarations'

router
  .group(() => {
    router
      .post('/supply-types', '#controllers/supply_types_controller.store')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.storeSupplyType))
    router
      .get('/supply-types', '#controllers/supply_types_controller.index')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexSupplyTypes))
    router
      .get('/supply-types/:id', '#controllers/supply_types_controller.show')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showSupplyType))
    router
      .put('/supply-types/:id', '#controllers/supply_types_controller.update')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.updateSupplyType))
    router
      .delete('/supply-types/:id', '#controllers/supply_types_controller.destroy')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.destroySupplyType))
    router
      .get('/supply-types/:id/characteristics', '#controllers/supply_types_controller.getWithCharacteristics')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showSupplyTypeWithCharacteristics))
  })
  .prefix('/api')
  .use(middleware.auth())
