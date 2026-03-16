import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/supply-value-histories', '#controllers/supply_value_histories_controller.index')
    router.post('/supply-value-histories', '#controllers/supply_value_histories_controller.store')
    router.get('/supply-value-histories/:id', '#controllers/supply_value_histories_controller.show')
    router.put('/supply-value-histories/:id', '#controllers/supply_value_histories_controller.update')
    router.delete('/supply-value-histories/:id', '#controllers/supply_value_histories_controller.destroy')
    router.get('/supplies/:supplyId/value-histories', '#controllers/supply_value_histories_controller.getBySupply')
    router.get('/supplies/:supplyId/value-histories/latest', '#controllers/supply_value_histories_controller.getLatestValue')
  })
  .prefix('/api')
  .use(middleware.auth())
