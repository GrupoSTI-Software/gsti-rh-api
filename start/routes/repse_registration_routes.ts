import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/repse-registrations',
      '#controllers/repse_registrations_controller.index'
    )
    router.get(
      '/repse-registrations/:id',
      '#controllers/repse_registrations_controller.show'
    )
    router.post(
      '/repse-registrations',
      '#controllers/repse_registrations_controller.store'
    )
    router.put(
      '/repse-registrations/:id',
      '#controllers/repse_registrations_controller.update'
    )
    router.delete(
      '/repse-registrations/:id',
      '#controllers/repse_registrations_controller.destroy'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
