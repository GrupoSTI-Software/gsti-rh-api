/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '../kernel.js'

/**
 * Límite de intentos de login (USRH1786736057519 E4):
 * 10 / 15 min por IP (espejo de platform auth) + 5 / 15 min por correo.
 */
const loginIpRateLimit = limiter.define('auth-login-ip', (ctx) => {
  return limiter.allowRequests(10).every('15 minutes').usingKey(ctx.request.ip())
})

const loginEmailRateLimit = limiter.define('auth-login-email', (ctx) => {
  const userEmail = String(ctx.request.input('userEmail') ?? 'unknown')
  return limiter.allowRequests(5).every('15 minutes').usingKey(`email:${userEmail}`)
})

router
  .group(() => {
    router
      .post('/login', '#controllers/user_controller.login')
      .use(loginIpRateLimit)
      .use(loginEmailRateLimit)
    router.post('/refresh', '#controllers/user_controller.refresh')
    router
      .post('/logout', '#controllers/user_controller.logout')
      .use(middleware.auth({ guards: ['api'] }))
    router.post('/recovery', '#controllers/user_controller.recoveryPassword')
    router.post('/request/verify/:token', '#controllers/user_controller.verifyRequestRecovery')
    router.post('/password/reset', '#controllers/user_controller.passwordReset')
    router.get('/session', '#controllers/user_controller.authUser')
    router
      .get('/session/permissions', '#controllers/session_permission_tree_controller.show')
      .use(middleware.auth())
    router
      .get('/session/permissions/version', '#controllers/session_permission_tree_controller.version')
      .use(middleware.auth())
    router.post('/request/code-verify/:pinCode', '#controllers/user_controller.verifyRequestPinCode')
  })
  .prefix('/api/auth')
