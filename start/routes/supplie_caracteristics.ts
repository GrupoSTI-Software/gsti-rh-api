import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/supplie-characteristics', '#controllers/supplie_caracteristics_controller.store')
    router.get('/supplie-characteristics', '#controllers/supplie_caracteristics_controller.index')
    router.get('/supplie-characteristics/:id', '#controllers/supplie_caracteristics_controller.show')
    router.put('/supplie-characteristics/:id', '#controllers/supplie_caracteristics_controller.update')
    router.delete('/supplie-characteristics/:id', '#controllers/supplie_caracteristics_controller.destroy')
    router.get('/supplie-characteristics/:id/values', '#controllers/supplie_caracteristics_controller.getWithValues')
    router.get('/supplie-characteristics/by-supply-type/:supplyTypeId', '#controllers/supplie_caracteristics_controller.getBySupplyType')
  })
  .prefix('/api')
  .use(middleware.auth())
