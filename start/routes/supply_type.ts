import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/supply-types', '#controllers/supply_types_controller.store')
    router.get('/supply-types', '#controllers/supply_types_controller.index')
    router.get('/supply-types/:id', '#controllers/supply_types_controller.show')
    router.put('/supply-types/:id', '#controllers/supply_types_controller.update')
    router.delete('/supply-types/:id', '#controllers/supply_types_controller.destroy')
    router.get('/supply-types/:id/characteristics', '#controllers/supply_types_controller.getWithCharacteristics')
  })
  .prefix('/api')
  .use(middleware.auth())
