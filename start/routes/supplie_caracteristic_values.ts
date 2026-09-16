import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SUPPLIES_PERMISSION_DECLARATIONS } from '#constants/supplies_permission_declarations'

router
  .group(() => {
    router
      .post('/supplie-characteristic-values', '#controllers/supplie_caracteristic_values_controller.store')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.storeSupplyCharacteristicValue))
    router
      .get('/supplie-characteristic-values', '#controllers/supplie_caracteristic_values_controller.index')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexSupplyCharacteristicValues))
    router
      .get('/supplie-characteristic-values/:id', '#controllers/supplie_caracteristic_values_controller.show')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showSupplyCharacteristicValue))
    router
      .put('/supplie-characteristic-values/:id', '#controllers/supplie_caracteristic_values_controller.update')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.updateSupplyCharacteristicValue))
    router
      .delete('/supplie-characteristic-values/:id', '#controllers/supplie_caracteristic_values_controller.destroy')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.destroySupplyCharacteristicValue))
    router
      .get('/supplie-characteristic-values/:id/characteristic', '#controllers/supplie_caracteristic_values_controller.getWithCharacteristic')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showSupplyCharacteristicValueWithCharacteristic))
    router
      .get('/supplie-characteristic-values/by-characteristic/:supplieCaracteristicId', '#controllers/supplie_caracteristic_values_controller.getByCharacteristic')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexSupplyCharacteristicValuesByCharacteristic))
    router
      .get('/supplie-characteristic-values/by-supply/:supplieId', '#controllers/supplie_caracteristic_values_controller.getBySupply')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexSupplyCharacteristicValuesBySupply))
  })
  .prefix('/api')
  .use(middleware.auth())
  // El catálogo de activos dejó de ser compartido: cada empresa ve el suyo. Sin
  // este middleware no hay TenantContext y el mixin no filtraría nada.
  .use(middleware.businessScope())
