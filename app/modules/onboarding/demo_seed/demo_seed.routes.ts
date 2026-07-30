import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'

/**
 * Rutas de la siembra demo del onboarding (USRH1785438246847).
 *
 * Divergencia deliberada del área (documentada en el spec): además de auth,
 * montan middleware.businessScope() porque este submódulo crea entidades
 * tenant-scoped — el scope fail-closed por header X-Business-Unit-Id es la
 * primera condición de pertenencia; el snapshot de BU por fila sembrada, la
 * segunda.
 *
 * Rate limit por userId (anti-abuso, regla 11): el limiter corre después del
 * auth del grupo, por lo que auth.user ya está resuelto.
 */
const demoSeedLimit = limiter.define('onboarding-demo-seed', (ctx) => {
  const key = ctx.auth?.user?.userId ?? ctx.request.ip()
  return limiter.allowRequests(5).every('15 minutes').usingKey(`user:${key}`)
})

const demoCredentialsLimit = limiter.define('onboarding-demo-credentials', (ctx) => {
  const key = ctx.auth?.user?.userId ?? ctx.request.ip()
  return limiter.allowRequests(10).every('15 minutes').usingKey(`user:${key}`)
})

router
  .group(() => {
    router
      .post('/me/demo-seed', '#modules/onboarding/demo_seed/demo_seed.controller.seed')
      .use(demoSeedLimit)
    router
      .post(
        '/me/demo-seed/credentials',
        '#modules/onboarding/demo_seed/demo_seed.controller.regenerateCredentials'
      )
      .use(demoCredentialsLimit)
  })
  .prefix('/api/onboarding')
  .use(middleware.auth())
  .use(middleware.businessScope())
