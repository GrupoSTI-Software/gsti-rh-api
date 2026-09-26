import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas de mutación del estado de onboarding.
 *
 * Todas requieren autenticación. No usan middleware.businessScope():
 * el onboarding es personal del admin del tenant (aislado por auth.user.userId).
 */
router
  .group(() => {
    router.put('/me/intent', '#modules/onboarding/state/state.controller.setIntent')
    router.post(
      '/me/steps/:stepSlug/complete',
      '#modules/onboarding/state/state.controller.completeStep'
    )
    router.post(
      '/me/steps/:stepSlug/skip',
      '#modules/onboarding/state/state.controller.skipStep'
    )
    router.put('/me/status', '#modules/onboarding/state/state.controller.setStatus')
  })
  .prefix('/api/onboarding')
  .use(middleware.auth())
