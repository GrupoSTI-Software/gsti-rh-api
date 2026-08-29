import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Cumplimiento de pendientes del expediente de salida (USRH1786568279590).
 * RBAC granular vía `ItemsService.assertCanAccess` en el controller.
 */
router
  .group(() => {
    router.put(
      '/:offboardingId/items/:itemId/complete',
      '#modules/employee-offboarding/items/items.controller.complete'
    )
    router.put(
      '/:offboardingId/items/:itemId/revert',
      '#modules/employee-offboarding/items/items.controller.revert'
    )
    router.put(
      '/:offboardingId/items/:itemId',
      '#modules/employee-offboarding/items/items.controller.update'
    )
  })
  .prefix('/api/employee-offboardings')
  .use(middleware.auth())
  .use(middleware.businessScope())
