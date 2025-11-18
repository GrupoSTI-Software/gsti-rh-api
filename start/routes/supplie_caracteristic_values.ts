import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/supplie-characteristic-values', '#controllers/supplie_caracteristic_values_controller.store')
    router.get('/supplie-characteristic-values', '#controllers/supplie_caracteristic_values_controller.index')
    router.get('/supplie-characteristic-values/:id', '#controllers/supplie_caracteristic_values_controller.show')
    router.put('/supplie-characteristic-values/:id', '#controllers/supplie_caracteristic_values_controller.update')
    router.delete('/supplie-characteristic-values/:id', '#controllers/supplie_caracteristic_values_controller.destroy')
    router.get('/supplie-characteristic-values/:id/characteristic', '#controllers/supplie_caracteristic_values_controller.getWithCharacteristic')
    router.get('/supplie-characteristic-values/by-characteristic/:supplieCaracteristicId', '#controllers/supplie_caracteristic_values_controller.getByCharacteristic')
    router.get('/supplie-characteristic-values/by-supply/:supplieId', '#controllers/supplie_caracteristic_values_controller.getBySupply')
  })
  .prefix('/api')
  .use(middleware.auth())
