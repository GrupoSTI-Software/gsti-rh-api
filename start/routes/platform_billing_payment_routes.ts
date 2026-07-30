import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas del módulo de pagos de suscripción (USRH1784574994922).
 *
 * Todas protegidas por `auth` + `platformAdmin` — globales, sin scope de tenant.
 * Prefijo: /api/platform/billing
 *
 * ─── Pagos ────────────────────────────────────────────────────────────────
 *   GET    /api/platform/billing/subscriptions/:subscriptionId/payments
 *          → histórico paginado, orden paid_at DESC
 *   GET    /api/platform/billing/payments/:paymentId/download
 *          → enlace temporal firmado para descargar el comprobante
 *   POST   /api/platform/billing/subscriptions/:subscriptionId/payments
 *          → registrar pago con comprobante (multipart/form-data)
 */
router
  .group(() => {
    router.get(
      '/subscriptions/:subscriptionId/payments',
      '#controllers/billing_payment_controller.index'
    )
    router.get(
      '/payments/:paymentId/download',
      '#controllers/billing_payment_controller.download'
    )
    router.post(
      '/subscriptions/:subscriptionId/payments',
      '#controllers/billing_payment_controller.store'
    )
  })
  .prefix('/api/platform/billing')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
