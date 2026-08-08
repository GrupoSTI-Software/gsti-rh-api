import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'

/**
 * Previsualización del cambio de cantidad contratada (USRH1786107870847).
 * Clave por usuario autenticado: la ruta exige sesión y varios usuarios de
 * una misma empresa pueden compartir salida NAT.
 */
const billingPreviewRateLimit = limiter.define('billing-preview', (ctx) => {
  const userId = ctx.auth.user?.userId ?? 'anonimo'
  return limiter.allowRequests(30).every('1 minute').usingKey(`billing-preview:${userId}`)
})

router
  .group(() => {
    router.get('/subscription/me', '#controllers/billing_tenant_controller.mySubscription')
    router.post(
      '/subscription',
      '#controllers/billing_tenant_controller.contractSubscription'
    )
    router
      .get(
        '/subscription/change-preview',
        '#controllers/billing_tenant_controller.previewSubscriptionChange'
      )
      .use(billingPreviewRateLimit)
  })
  .prefix('/api/billing')
  .use(middleware.auth())
  .use(middleware.businessScope())
