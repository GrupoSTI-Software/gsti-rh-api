import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Cuarentena de checadores (spec ADMS 9.3). Antes de cualquier
 * `/:accessPointId`, o "quarantine" se leeria como un identificador.
 */
router
  .group(() => {
    router.get('/quarantine', '#modules/access-point/quarantine/quarantine.controller.index')
    router.post(
      '/quarantine/claim',
      '#modules/access-point/quarantine/quarantine.controller.claim'
    )
  })
  .prefix('/api/v1/access-points')
  .use(middleware.auth())
  .use(middleware.businessScope())
