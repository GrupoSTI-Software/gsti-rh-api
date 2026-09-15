import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS } from '#constants/employees_download_permission_declarations'
import { SUPPLIES_PERMISSION_DECLARATIONS } from '#constants/supplies_permission_declarations'

router
  .group(() => {
    router
      .post('/supplies', '#controllers/supplies_controller.store')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.storeSupply))
    router
      .get('/supplies', '#controllers/supplies_controller.index')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexSupplies))
    // Antes de `/:id` para que "excel" no se lea como identificador. Ya exige el
    // permiso de reporte de Empleados; una ruta lleva un solo gate.
    router
      .get('/supplies/excel', '#controllers/supplies_controller.getExcel')
      .use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getSuppliesExcel))
    // Sin gate: la Matriz de vencimientos lo usa para pintar el activo asignado
    // a un colaborador. Pedir supplies:read la rompería.
    router.get('/supplies/:id', '#controllers/supplies_controller.show')
    router
      .put('/supplies/:id', '#controllers/supplies_controller.update')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.updateSupply))
    router
      .delete('/supplies/:id', '#controllers/supplies_controller.destroy')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.destroySupply))
    router
      .post('/supplies/:id/deactivate', '#controllers/supplies_controller.deactivate')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.deactivateSupply))
    router
      .get('/supplies/:id/with-type', '#controllers/supplies_controller.getWithType')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showSupplyWithType))
    router
      .get('/supplies/by-type/:supplyTypeId', '#controllers/supplies_controller.getByType')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexSuppliesByType))
  })
  .prefix('/api')
  .use(middleware.auth())
