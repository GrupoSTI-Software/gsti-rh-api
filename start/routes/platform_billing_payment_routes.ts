import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas del módulo de pagos de suscripción (USRH1784574994922).
 *
 * Todas protegidas por `auth` + `platformAdmin` — globales, sin scope de tenant.
 * Prefijo: /api/platform/billing
 *
 * ─── Pagos ────────────────────────────────────────────────────────────────
 *   POST   /api/platform/billing/subscriptions/:subscriptionId/payments
 *          → registrar pago con comprobante (multipart/form-data)
 */
router
  .group(() => {
    router.post(
      '/subscriptions/:subscriptionId/payments',
      '#controllers/billing_payment_controller.store'
    )
  })
  .prefix('/api/platform/billing')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
