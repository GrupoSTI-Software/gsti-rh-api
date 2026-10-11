import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Marca de anuncios de producto del usuario autenticado.
 *
 * GET /api/announcements/me — marca vigente.
 * PUT /api/announcements/me — crea o avanza la marca (nunca retrocede).
 *
 * Requiere autenticación. No usa middleware.businessScope() ni permissionGate: la
 * marca es personal del usuario (aislada por auth.user.userId), como el consentimiento.
 */
router
  .group(() => {
    router.get('/me', '#modules/announcements/announcements.controller.show')
    router.put('/me', '#modules/announcements/announcements.controller.update')
  })
  .prefix('/api/announcements')
  .use(middleware.auth())
