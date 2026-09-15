import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SUPPLIES_PERMISSION_DECLARATIONS } from '#constants/supplies_permission_declarations'

router
  .group(() => {
    router
      .post('/supplie-characteristics', '#controllers/supplie_caracteristics_controller.store')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.storeSupplyCharacteristic))
    router
      .get('/supplie-characteristics', '#controllers/supplie_caracteristics_controller.index')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexSupplyCharacteristics))
    router
      .get('/supplie-characteristics/:id', '#controllers/supplie_caracteristics_controller.show')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showSupplyCharacteristic))
    router
      .put('/supplie-characteristics/:id', '#controllers/supplie_caracteristics_controller.update')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.updateSupplyCharacteristic))
    router
      .delete('/supplie-characteristics/:id', '#controllers/supplie_caracteristics_controller.destroy')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.destroySupplyCharacteristic))
    router
      .get('/supplie-characteristics/:id/values', '#controllers/supplie_caracteristics_controller.getWithValues')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showSupplyCharacteristicWithValues))
    router
      .get('/supplie-characteristics/by-supply-type/:supplyTypeId', '#controllers/supplie_caracteristics_controller.getBySupplyType')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexSupplyCharacteristicsBySupplyType))
  })
  .prefix('/api')
  .use(middleware.auth())
