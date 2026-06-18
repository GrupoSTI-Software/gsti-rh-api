import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas del módulo de consentimiento legal.
 *
 * GET  /api/consent/me — estado de aceptación del usuario autenticado.
 * POST /api/consent/me — registra la aceptación (idempotente por versión).
 *
 * Requiere autenticación. No usa middleware.businessScope(): el consentimiento
 * es personal del usuario (aislado por auth.user.userId, como el onboarding).
 */
router
  .group(() => {
    router.get('/me', '#modules/consent/acceptance/acceptance.controller.getStatus')
    router.post('/me', '#modules/consent/acceptance/acceptance.controller.record')
  })
  .prefix('/api/consent')
  .use(middleware.auth())
