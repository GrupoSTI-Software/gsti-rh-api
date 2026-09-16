import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Estado de los checadores (spec ADMS 9.2).
 *
 * `/health` va ANTES que `/:accessPointId/health`: al reves, Adonis tomaria
 * "health" como un identificador y la lista nunca resolveria.
 */
router
  .group(() => {
    router.get('/health', '#modules/access-point/health/health.controller.index')
    router.get(
      '/:accessPointId/health',
      '#modules/access-point/health/health.controller.show'
    )
    /**
     * Sincronizar: deja un `INFO` en la cola y espera a que el equipo pase a
     * recogerlo. Puede tardar hasta veinte segundos por diseño.
     */
    router.post(
      '/:accessPointId/sync',
      '#modules/access-point/health/health.controller.sync'
    )
  })
  .prefix('/api/v1/access-points')
  .use(middleware.auth())
  .use(middleware.businessScope())
