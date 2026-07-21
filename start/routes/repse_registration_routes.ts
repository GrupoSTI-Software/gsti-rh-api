import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/repse-registrations',
      '#controllers/repse_registrations_controller.index'
    )
    // ANTES de `/:id` — rutas literales no deben colisionar con un id numérico.
    router.get(
      '/repse-registrations/get-expired-and-expiring',
      '#controllers/repse_registrations_controller.getExpiredAndExpiring'
    )
    router.post(
      '/repse-registrations/notifications/run-expiring-check',
      '#controllers/repse_registrations_controller.runExpiringCheck'
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
