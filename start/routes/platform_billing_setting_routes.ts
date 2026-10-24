import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Ajuste de cobro de la plataforma: días de gracia y activación de la
 * restricción (VLRH-H1791939650950). Solo consola de landlord.
 *
 * GET /api/platform/billing/settings        → vigente
 * PUT /api/platform/billing/settings        → nueva fila (append-only)
 * GET /api/platform/billing/settings/history → historial paginado
 */
router
  .group(() => {
    router.get('/settings', '#controllers/platform_billing_setting_controller.show')
    router.put('/settings', '#controllers/platform_billing_setting_controller.update')
    router.get('/settings/history', '#controllers/platform_billing_setting_controller.history')
  })
  .prefix('/api/platform/billing')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])