import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '../kernel.js'

/**
 * Rate-limit para el login de plataforma: 10 intentos por IP cada 15 minutos.
 * Más permisivo que el magic-link (5/min) para no bloquear trabajo operativo.
 */
const platformLoginRateLimit = limiter.define('platform-login', (ctx) => {
  return limiter.allowRequests(10).every('15 minutes').usingKey(ctx.request.ip())
})

/**
 * Rutas de autenticación de la consola interna landlord.
 * Prefijo: /api/platform/auth
 *
 * Públicos (validan identidad internamente):
 *   POST /login    — credenciales → sesión de plataforma
 *   POST /refresh  — rota el par de tokens single-use
 *
 * Protegidos (auth + platformAdmin):
 *   GET  /session  — identidad del administrador autenticado
 *   POST /logout   — invalida la sesión de plataforma
 */
router
  .group(() => {
    router
      .post('/login', '#controllers/platform_auth_controller.login')
      .use(platformLoginRateLimit)

    router.post('/refresh', '#controllers/platform_auth_controller.refresh')

    router
      .get('/session', '#controllers/platform_auth_controller.session')
      .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])

    router
      .post('/logout', '#controllers/platform_auth_controller.logout')
      .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
  })
  .prefix('/api/platform/auth')
