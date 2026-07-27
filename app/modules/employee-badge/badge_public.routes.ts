import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'

/**
 * Verificación pública del gafete (E4, USRH1784686362321). Espejo exacto de
 * `auth_magic_link_routes.ts`: grupo sin `auth()`/`businessScope()`, con
 * rate-limit 10/min por IP (regla 8).
 */
const employeeBadgeVerifyRateLimit = limiter.define('employee-badge-verify', (ctx) => {
  return limiter.allowRequests(10).every('1 minute').usingKey(ctx.request.ip())
})

router
  .group(() => {
    router
      .get('/verify/:token', '#modules/employee-badge/badge_public.controller.verify')
      .use(employeeBadgeVerifyRateLimit)
  })
  .prefix('/api/public/employee-badge')
