import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Avance de subida por tabla del checador (spec ADMS 4.4 y 11). El permiso se
 * resuelve dentro del controlador con `evaluateEnforced`; aqui solo van
 * autenticacion y alcance de empresa.
 */
router
  .group(() => {
    router.get(
      '/:accessPointId/upload-progress',
      '#modules/access-point/upload-progress/upload_progress.controller.index'
    )
    router.post(
      '/:accessPointId/upload-progress/reset',
      '#modules/access-point/upload-progress/upload_progress.controller.reset'
    )
  })
  .prefix('/api/v1/access-points')
  .use(middleware.auth())
  .use(middleware.businessScope())
