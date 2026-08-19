import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Expediente de salida por colaborador (USRH1786568279587).
 * RBAC granular vía `OffboardingsService.assertCanAccess` en el controller.
 */
router
  .group(() => {
    router.post('/', '#modules/employee-offboarding/offboardings/offboardings.controller.store')
    router.get(
      '/by-employee/:employeeId',
      '#modules/employee-offboarding/offboardings/offboardings.controller.byEmployee'
    )
  })
  .prefix('/api/employee-offboardings')
  .use(middleware.auth())
  .use(middleware.businessScope())
