import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/** Conciliacion de PINs desconocidos (spec ADMS 9.4). */
router
  .group(() => {
    router.get(
      '/unmapped-pins',
      '#modules/access-point/unmapped-pins/unmapped_pins.controller.index'
    )
    router.get(
      '/unmapped-pins/:unmappedPinId/candidates',
      '#modules/access-point/unmapped-pins/unmapped_pins.controller.candidates'
    )
    router.post(
      '/unmapped-pins/:unmappedPinId/link',
      '#modules/access-point/unmapped-pins/unmapped_pins.controller.link'
    )
    router.post(
      '/unmapped-pins/:unmappedPinId/dismiss',
      '#modules/access-point/unmapped-pins/unmapped_pins.controller.dismiss'
    )
  })
  .prefix('/api/v1/access-points')
  .use(middleware.auth())
  .use(middleware.businessScope())
