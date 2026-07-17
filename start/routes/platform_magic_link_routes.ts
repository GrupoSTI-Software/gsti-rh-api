import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'

/**
 * Rate-limit para endpoints públicos del magic link de plataforma.
 * 5 solicitudes por IP cada minuto.
 */
const platformMagicLinkRateLimit = limiter.define('platform-magic-link', (ctx) => {
  return limiter.allowRequests(5).every('1 minute').usingKey(ctx.request.ip())
})

/**
 * Rutas del flujo de magic link exclusivo para la consola interna landlord.
 * Prefijo: /api/platform/auth/magic-link
 *
 * Todos los endpoints son públicos; la elegibilidad se valida internamente.
 */
router
  .group(() => {
    router
      .post('/request', '#controllers/platform_magic_link_controller.request')
      .use(platformMagicLinkRateLimit)

    router.post('/verify', '#controllers/platform_magic_link_controller.verify')
  })
  .prefix('/api/platform/auth/magic-link')
