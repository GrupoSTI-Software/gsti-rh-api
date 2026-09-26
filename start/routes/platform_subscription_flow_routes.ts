import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * ─── Métricas de plataforma · flujos de suscripción ──────────────────────────
 *   GET  /api/platform/metrics/subscription-flows → movimiento del mes y el anterior
 *
 *   Tras guard platformAdmin (auth + is_platform_admin), aplicado a nivel de
 *   grupo y en ese orden. Ref: USRH1788052455656.
 */
router
  .group(() => {
    router.get(
      '/subscription-flows',
      '#controllers/platform_subscription_flow_controller.index'
    )
  })
  .prefix('/api/platform/metrics')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
