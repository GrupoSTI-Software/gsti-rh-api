import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Incidentes del canal (spec ADMS 11).
 *
 * Antes que cualquier `/:accessPointId`: si no, Adonis leeria "incidents" como
 * el identificador de un equipo.
 */
router
  .group(() => {
    router.get('/incidents', '#modules/access-point/incidents/incidents.controller.index')
    router.post(
      '/incidents/:incidentId/resolve',
      '#modules/access-point/incidents/incidents.controller.resolve'
    )
  })
  .prefix('/api/v1/access-points')
  .use(middleware.auth())
  .use(middleware.businessScope())
