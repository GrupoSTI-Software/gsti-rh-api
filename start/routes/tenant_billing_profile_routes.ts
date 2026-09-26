import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'

/**
 * Escritura del perfil fiscal del tenant (USRH1786737531066).
 * Clave por usuario autenticado: varios usuarios de una misma empresa pueden compartir salida NAT.
 */
const tenantBillingProfileWriteRateLimit = limiter.define(
  'tenant-billing-profile-write',
  (ctx) => {
    const userId = ctx.auth.user?.userId ?? 'anonimo'
    return limiter
      .allowRequests(20)
      .every('1 minute')
      .usingKey(`tenant-billing-profile-write:${userId}`)
  }
)

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
    router
      .put('/profile', '#controllers/tenant_billing_profile_controller.upsert')
      .use(tenantBillingProfileWriteRateLimit)
  })
  .prefix('/api/billing')
  .use(middleware.auth())
  .use(middleware.businessScope())
