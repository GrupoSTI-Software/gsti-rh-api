import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/** Perfil del checador (spec ADMS 9.1 y 11). Permiso dentro del controlador. */
router
  .group(() => {
    router.get(
      '/:accessPointId/profile',
      '#modules/access-point/device-profile/device_profile.controller.show'
    )
  })
  .prefix('/api/v1/access-points')
  .use(middleware.auth())
  .use(middleware.businessScope())
