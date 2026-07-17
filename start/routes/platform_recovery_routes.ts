import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'

/**
 * Rate-limit para el endpoint público de solicitud de recuperación.
 * 5 solicitudes por IP cada minuto.
 */
const platformRecoveryRateLimit = limiter.define('platform-recovery', (ctx) => {
  return limiter.allowRequests(5).every('1 minute').usingKey(ctx.request.ip())
})

/**
 * Rutas del flujo de recuperación de contraseña exclusivo para la consola
 * interna landlord.
 *
 * Endpoints públicos (validan elegibilidad internamente):
 *   POST /api/platform/auth/recovery                    — etapa 0: solicitar PIN + enlace
 *   POST /api/platform/auth/recovery/verify/:token      — etapa 1: validar token del enlace
 *   POST /api/platform/auth/recovery/code-verify        — etapa 2: validar OTP de 6 dígitos
 *   POST /api/platform/auth/password/reset              — etapa 3: establecer nueva contraseña
 */
router
  .group(() => {
    router
      .post('/', '#controllers/platform_recovery_controller.recovery')
      .use(platformRecoveryRateLimit)

    router.post('/verify/:token', '#controllers/platform_recovery_controller.verifyToken')

    router.post('/code-verify', '#controllers/platform_recovery_controller.codeVerify')
  })
  .prefix('/api/platform/auth/recovery')

router.post('/api/platform/auth/password/reset', '#controllers/platform_recovery_controller.passwordReset')
