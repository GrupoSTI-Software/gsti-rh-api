import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS } from '#constants/employees_download_permission_declarations'

router
  .group(() => {
    router.post('/supplies', '#controllers/supplies_controller.store')
    router.get('/supplies', '#controllers/supplies_controller.index')
    router.get('/supplies/excel', '#controllers/supplies_controller.getExcel')
      .use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getSuppliesExcel))
    router.get('/supplies/:id', '#controllers/supplies_controller.show')
    router.put('/supplies/:id', '#controllers/supplies_controller.update')
    router.delete('/supplies/:id', '#controllers/supplies_controller.destroy')
    router.post('/supplies/:id/deactivate', '#controllers/supplies_controller.deactivate')
    router.get('/supplies/:id/with-type', '#controllers/supplies_controller.getWithType')
    router.get('/supplies/by-type/:supplyTypeId', '#controllers/supplies_controller.getByType')
  })
  .prefix('/api')
  .use(middleware.auth())
