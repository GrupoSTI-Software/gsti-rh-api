import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas de lectura del catálogo de onboarding.
 *
 * GET /api/onboarding/me devuelve el panorama completo del usuario:
 * intenciones disponibles, intención elegida y secuencia aplicable de pasos con avance.
 *
 * Requiere autenticación. No usa middleware.businessScope(): el onboarding
 * es personal del admin del tenant (aislado por auth.user.userId).
 */
router
  .group(() => {
    router.get('/me', '#modules/onboarding/catalog/catalog.controller.me')
  })
  .prefix('/api/onboarding')
  .use(middleware.auth())
