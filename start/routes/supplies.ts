import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/supplies', '#controllers/supplies_controller.store')
    router.get('/supplies', '#controllers/supplies_controller.index')
    router.get('/supplies/excel', '#controllers/supplies_controller.getExcel')
    router.get('/supplies/:id', '#controllers/supplies_controller.show')
    router.put('/supplies/:id', '#controllers/supplies_controller.update')
    router.delete('/supplies/:id', '#controllers/supplies_controller.destroy')
    router.post('/supplies/:id/deactivate', '#controllers/supplies_controller.deactivate')
    router.get('/supplies/:id/with-type', '#controllers/supplies_controller.getWithType')
    router.get('/supplies/by-type/:supplyTypeId', '#controllers/supplies_controller.getByType')
  })
  .prefix('/api')
  .use(middleware.auth())
