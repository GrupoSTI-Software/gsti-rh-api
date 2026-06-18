import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/holidays', '#controllers/holidays_controller.store')
    router.get('/holidays', '#controllers/holidays_controller.index')
    router.get('/holidays/:id', '#controllers/holidays_controller.show')
    router.put('/holidays/:id', '#controllers/holidays_controller.update')
    router.delete('/holidays/:id', '#controllers/holidays_controller.destroy')
    router.get('/icons', '#controllers/icons_controller.index')
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
