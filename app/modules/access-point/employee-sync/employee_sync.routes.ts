import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Alta, PIN y revocacion del colaborador en un checador (spec ADMS 8).
 *
 * Van en el mismo prefijo que la asignacion existente y con el mismo permiso:
 * la operacion es sobre el colaborador, no sobre el catalogo de equipos. El
 * permiso se resuelve dentro del controlador con `evaluateEnforced`.
 */
/** Lectura del padron del equipo. Va en `/api/v1` como el resto de operacion. */
router
  .group(() => {
    router.get(
      '/:accessPointId/employees',
      '#modules/access-point/employee-sync/employee_sync.controller.listByAccessPoint'
    )
  })
  .prefix('/api/v1/access-points')
  .use(middleware.auth())
  .use(middleware.businessScope())

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
    /**
     * Cierre a mano de una baja que el equipo nunca confirmo. Para el aparato
     * que ya no va a contestar; con uno vivo, la via es esperar su respuesta.
     */
    router.post(
      '/:accessPointId/employee/:employeeId/revoke/force',
      '#modules/access-point/employee-sync/employee_sync.controller.forceRevoke'
    )
  })
  .prefix('/api/access-points')
  .use(middleware.auth())
  .use(middleware.businessScope())

/**
 * La vuelta del padron: los checadores de un colaborador.
 *
 * Cuelga de `/employees` porque la pantalla que la consume es la pestaña de
 * biometricos de la persona, y por eso pide el permiso de lectura de esa
 * pestaña y no el del catalogo de equipos.
 */
router
  .group(() => {
    router.get(
      '/:employeeId/access-points',
      '#modules/access-point/employee-sync/employee_sync.controller.listByEmployee'
    )
  })
  .prefix('/api/v1/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
