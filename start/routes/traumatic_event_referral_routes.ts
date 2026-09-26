import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas anidadas de canalizaciones bajo el reporte de evento traumático.
 * Autenticadas (Bearer) y con scope multi-tenant resuelto por el header
 * X-Business-Unit-Id; el scope del reporte padre se valida en el servicio.
 */
router
  .group(() => {
    router.get(
      '/traumatic-event-reports/:reportId/referrals',
      '#controllers/traumatic_event_referral_controller.index'
    )
    router.post(
      '/traumatic-event-reports/:reportId/referrals',
      '#controllers/traumatic_event_referral_controller.store'
    )
    router.put(
      '/traumatic-event-reports/:reportId/referrals/:referralId',
      '#controllers/traumatic_event_referral_controller.update'
    )
    router.delete(
      '/traumatic-event-reports/:reportId/referrals/:referralId',
      '#controllers/traumatic_event_referral_controller.destroy'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
