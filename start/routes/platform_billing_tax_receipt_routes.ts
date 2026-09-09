import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'

/**
 * Alta y lectura del comprobante fiscal de membresía (USRH1788288461963).
 *
 * Superficie de plataforma únicamente. Guard a nivel de grupo, nunca por ruta:
 * `auth` antes de `platformAdmin`.
 *
 *   POST /api/platform/billing/payments/:paymentId/tax-receipt
 *        → registrar el CFDI contra el pago (multipart/form-data)
 *   GET  /api/platform/billing/payments/:paymentId/tax-receipt
 *        → comprobante vivo, o `data: null` si está pendiente de facturar
 *   GET  /api/platform/billing/tax-receipts/:taxReceiptId/files/:fileType/download
 *        → enlace firmado de 300 s (`fileType` ∈ xml | pdf)
 */
const taxReceiptWriteRateLimit = limiter.define('tax-receipt-write', (ctx) => {
  const userId = ctx.auth.user?.userId ?? 'anon'
  return limiter.allowRequests(20).every('10 minutes').usingKey(`tax-receipt-write:${userId}`)
})

router
  .group(() => {
    router
      .post('/payments/:paymentId/tax-receipt', '#controllers/billing_tax_receipt_controller.store')
      .use(taxReceiptWriteRateLimit)
    router.get('/payments/:paymentId/tax-receipt', '#controllers/billing_tax_receipt_controller.show')
    router.get(
      '/tax-receipts/:taxReceiptId/files/:fileType/download',
      '#controllers/billing_tax_receipt_controller.download'
    )
  })
  .prefix('/api/platform/billing')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
