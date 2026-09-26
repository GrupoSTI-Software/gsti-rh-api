import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/repse-specialized-services',
      '#controllers/repse_specialized_services_controller.index'
    )
    router.get(
      '/repse-specialized-services/:id',
      '#controllers/repse_specialized_services_controller.show'
    )
    router.post(
      '/repse-specialized-services',
      '#controllers/repse_specialized_services_controller.store'
    )
    router.put(
      '/repse-specialized-services/:id',
      '#controllers/repse_specialized_services_controller.update'
    )
    router.delete(
      '/repse-specialized-services/:id',
      '#controllers/repse_specialized_services_controller.destroy'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
