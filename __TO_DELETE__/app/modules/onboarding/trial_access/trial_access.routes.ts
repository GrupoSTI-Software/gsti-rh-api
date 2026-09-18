import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Ruta del paso "Pruébalo como tu empleado" del onboarding.
 * Requiere autenticación (el admin del tenant).
 */
router
  .post('/api/onboarding/me/trial-access', '#modules/onboarding/trial_access/trial_access.controller.generate')
  .use(middleware.auth())
