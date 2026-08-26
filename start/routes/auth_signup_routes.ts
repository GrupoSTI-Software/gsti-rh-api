import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'

const signupRateLimit = limiter.define('signup', (ctx) => {
  return limiter
    .allowRequests(5)
    .every('1 minute')
    .usingKey(ctx.request.ip())
})

/**
 * Catálogo público del paso 1 del registro. Límite propio y más holgado que
 * el del registro (5/min): la pantalla consulta el precio en cada cambio de
 * cantidad y el frontend aplica debounce.
 */
const signupCatalogRateLimit = limiter.define('signup-catalog', (ctx) => {
  return limiter.allowRequests(30).every('1 minute').usingKey(ctx.request.ip())
})

router
  .group(() => {
    router.post('/start', '#controllers/auth_signup_controller.start')
    router.post('/verify-otp', '#controllers/auth_signup_controller.verifyOtp')
    router.post('/complete', '#controllers/auth_signup_controller.completeSignup')
  })
  .prefix('/api/auth/signup')
  .use(signupRateLimit)

router
  .group(() => {
    router.get('/plans', '#controllers/billing_tenant_controller.publicPlans')
    router
      .get('/plans/:planId/price', '#controllers/billing_tenant_controller.publicPlanPrice')
      .where('planId', router.matchers.number())
    router.get('/public-plan', '#controllers/billing_tenant_controller.publicPlan')
  })
  .prefix('/api/signup')
  .use(signupCatalogRateLimit)
