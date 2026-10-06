import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de aceptaciones legales de plataforma (USRH1790610965452).
 *
 * Dato de plataforma, sin scope de tenant: protegidas por `auth` +
 * `platformAdmin`. Prefijo: /api/platform
 *
 *   GET    /api/platform/legal-acceptances → listado de aceptaciones legales
 *   GET    /api/platform/tenants/:businessUnitPublicId/legal-acceptances
 *                                          → historial de aceptaciones de la empresa (USRH1790610965466)
 */
router
  .group(() => {
    router.get('/legal-acceptances', '#modules/consent/platform/platform_consent.controller.index')
    router.get(
      '/tenants/:businessUnitPublicId/legal-acceptances',
      '#modules/consent/platform/platform_consent.controller.tenantHistory'
    )
  })
  .prefix('/api/platform')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
