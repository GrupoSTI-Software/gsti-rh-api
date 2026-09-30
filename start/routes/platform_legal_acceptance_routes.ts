import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de aceptaciones legales de plataforma (USRH1790610965452).
 *
 * Dato de plataforma, sin scope de tenant: protegidas por `auth` +
 * `platformAdmin`. Prefijo: /api/platform
 *
 *   GET    /api/platform/legal-acceptances → listado de aceptaciones legales
 */
router.group(() => {
  router.get('/legal-acceptances', '#modules/consent/platform/platform_consent.controller.index')
})
  .prefix('/api/platform')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
