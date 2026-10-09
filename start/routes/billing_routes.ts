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

/**
 * Lectura de tarjeta predeterminada en Stripe (USRH1790724549203).
 * Clave por usuario autenticado con respaldo por IP.
 */
const billingPaymentMethodReadRateLimit = limiter.define('billing-payment-method-read', (ctx) => {
  const userId = ctx.auth.user?.userId
  const key =
    userId !== undefined && userId !== null
      ? `billing-payment-method-read:${userId}`
      : `billing-payment-method-read:${ctx.request.ip()}`
  return limiter.allowRequests(30).every('1 minute').usingKey(key)
})

router
  .group(() => {
    router.get('/subscription/me', '#controllers/billing_tenant_controller.mySubscription')
    router
      .get(
        '/subscription/payment-method',
        '#controllers/billing_payment_method_controller.show'
      )
      .use(billingPaymentMethodReadRateLimit)
    router.post(
      '/subscription',
      '#controllers/billing_tenant_controller.contractSubscription'
    )
    // Aviso comercial, no un cobro: la cuota evita que el boton repetido
    // inunde el buzon del equipo.
    router
      .post(
        '/subscription/renewal-request',
        '#controllers/billing_tenant_controller.requestRenewal'
      )
      .use(billingSubscriptionChangeRateLimit)
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
