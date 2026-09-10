import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/** Ajuste de la hora del checador (spec ADMS 6.7 y 11). */
router
  .group(() => {
    router.post(
      '/:accessPointId/clock-sync',
      '#modules/access-point/device-clock/device_clock.controller.sync'
    )
  })
  .prefix('/api/v1/access-points')
  .use(middleware.auth())
  .use(middleware.businessScope())
