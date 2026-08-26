import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Expediente de salida (USRH1786568279587 + listado, cierre y reapertura de
 * USRH1786568279596). RBAC granular vía `OffboardingsService.assertCanAccess`
 * en el controller. Las rutas estáticas se declaran ANTES que las
 * paramétricas (molde `start/routes/position_level_routes.ts`).
 */
router
  .group(() => {
    router.get('/', '#modules/employee-offboarding/offboardings/offboardings.controller.index')
    router.post('/', '#modules/employee-offboarding/offboardings/offboardings.controller.store')
    router.get(
      '/by-employee/:employeeId',
      '#modules/employee-offboarding/offboardings/offboardings.controller.byEmployee'
    )
    router.patch(
      '/:employeeOffboardingId/close',
      '#modules/employee-offboarding/offboardings/offboardings.controller.close'
    )
    router.patch(
      '/:employeeOffboardingId/reopen',
      '#modules/employee-offboarding/offboardings/offboardings.controller.reopen'
    )
  })
  .prefix('/api/employee-offboardings')
  .use(middleware.auth())
  .use(middleware.businessScope())
