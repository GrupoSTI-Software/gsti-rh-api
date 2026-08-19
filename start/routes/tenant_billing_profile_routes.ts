import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas del perfil fiscal del tenant bajo `/api/billing/profile`.
 *
 * Archivo separado de `billing_routes.ts` para no mezclar suscripción con
 * datos fiscales (USRH1786737531057). Mismo prefijo y middleware que billing:
 * `auth()` + `businessScope()`.
 */
router
  .group(() => {
    router.get('/profile', '#controllers/tenant_billing_profile_controller.show')
    router.put('/profile', '#controllers/tenant_billing_profile_controller.upsert')
  })
  .prefix('/api/billing')
  .use(middleware.auth())
  .use(middleware.businessScope())
