import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS } from '#constants/documents_expiration_matrix_permission_declarations'

router
  .group(() => {
    router.get(
      '/repse-registrations',
      '#controllers/repse_registrations_controller.index'
    )
    // ANTES de `/:id` — rutas literales no deben colisionar con un id numérico.
    // Solo lo lee la Matriz de vencimientos: exige su `read`, no el de REPSE.
    router
      .get(
        '/repse-registrations/get-expired-and-expiring',
        '#controllers/repse_registrations_controller.getExpiredAndExpiring'
      )
      .use(
        middleware.permissionGate(
          DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS.getExpiredAndExpiringRepseRegistrations
        )
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
    router.post(
      '/repse-registrations/:id/constancia',
      '#controllers/repse_registrations_controller.uploadConstancia'
    )
    router.put(
      '/repse-registrations/:id/constancia',
      '#controllers/repse_registrations_controller.uploadConstancia'
    )
    router.get(
      '/repse-registrations/:id/constancia',
      '#controllers/repse_registrations_controller.downloadConstancia'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
