import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Marca de anuncios de producto del usuario autenticado.
 *
 * GET /api/announcements/me — marca vigente.
 * PUT /api/announcements/me — crea o avanza la marca (nunca retrocede).
 * GET /api/announcements/me/deck — slides que le tocan al usuario (bienvenida o novedades).
 *
 * Requiere autenticación. No usa middleware.businessScope() ni permissionGate: la
 * marca es personal del usuario (aislada por auth.user.userId), como el consentimiento.
 * El deck filtra cada slide por permiso dentro del service, no con un gate de ruta.
 */
router
  .group(() => {
    router.get('/me', '#modules/announcements/announcements.controller.show')
    router.put('/me', '#modules/announcements/announcements.controller.update')
    router.get('/me/deck', '#modules/announcements/announcements.controller.deck')
  })
  .prefix('/api/announcements')
  .use(middleware.auth())
