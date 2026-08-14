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

/**
 * Solicitud de aumento de cantidad contratada (USRH1786107870850).
 * Cuota más estrecha que la previsualización porque esta ruta escribe y compromete dinero.
 */
const billingChangeRequestRateLimit = limiter.define('billing-change-request', (ctx) => {
  const userId = ctx.auth.user?.userId ?? 'anonimo'
  return limiter
    .allowRequests(10)
    .every('1 minute')
    .usingKey(`billing-change-request:${userId}`)
})

/**
 * Agendar o cancelar reducción de cantidad contratada (USRH1786107870853).
 * Misma cuota conservadora que el aumento: escritura sobre la suscripción.
 */
const billingSubscriptionChangeRateLimit = limiter.define('billing-subscription-change', (ctx) => {
  const userId = ctx.auth.user?.userId ?? 'anonimo'
  return limiter
    .allowRequests(10)
    .every('1 minute')
    .usingKey(`billing-subscription-change:${userId}`)
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
    router
      .post(
        '/subscription/changes/increase',
        '#controllers/billing_tenant_controller.requestSubscriptionIncrease'
      )
      .use(billingChangeRequestRateLimit)
    router
      .post(
        '/subscription/changes/decrease',
        '#controllers/billing_tenant_controller.scheduleSubscriptionDecrease'
      )
      .use(billingSubscriptionChangeRateLimit)
    router
      .post(
        '/subscription/changes/cancel',
        '#controllers/billing_tenant_controller.cancelSubscriptionChange'
      )
      .use(billingSubscriptionChangeRateLimit)
  })
  .prefix('/api/billing')
  .use(middleware.auth())
  .use(middleware.businessScope())
