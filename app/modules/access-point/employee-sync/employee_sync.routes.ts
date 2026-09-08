import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Alta, PIN y revocacion del colaborador en un checador (spec ADMS 8).
 *
 * Van en el mismo prefijo que la asignacion existente y con el mismo permiso:
 * la operacion es sobre el colaborador, no sobre el catalogo de equipos. El
 * permiso se resuelve dentro del controlador con `evaluateEnforced`.
 */
router
  .group(() => {
    router.put(
      '/:accessPointId/employee/:employeeId/pin',
      '#modules/access-point/employee-sync/employee_sync.controller.setPin'
    )
    router.post(
      '/:accessPointId/employee/:employeeId/send',
      '#modules/access-point/employee-sync/employee_sync.controller.send'
    )
    router.post(
      '/:accessPointId/employee/:employeeId/revoke',
      '#modules/access-point/employee-sync/employee_sync.controller.revoke'
    )
  })
  .prefix('/api/access-points')
  .use(middleware.auth())
  .use(middleware.businessScope())
