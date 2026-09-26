import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Comandos hacia los checadores (spec ADMS 11). El permiso se resuelve dentro
 * del controlador con `evaluateEnforced`; aqui solo autenticacion y alcance.
 */
router
  .group(() => {
    router.get(
      '/:accessPointId/commands',
      '#modules/device-commands/device_commands.controller.index'
    )
    router.post(
      '/:accessPointId/commands/:commandId/cancel',
      '#modules/device-commands/device_commands.controller.cancel'
    )
    router.post(
      '/:accessPointId/commands/:commandId/retry',
      '#modules/device-commands/device_commands.controller.retry'
    )
  })
  .prefix('/api/v1/access-points')
  .use(middleware.auth())
  .use(middleware.businessScope())
