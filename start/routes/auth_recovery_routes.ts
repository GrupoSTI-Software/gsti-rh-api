import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'

const recoveryCodeVerifyTokenLimit = limiter.define('recovery-code-verify-token', (ctx) => {
  const token = String(ctx.request.input('token') ?? 'unknown')
  return limiter.allowRequests(5).every('15 minutes').usingKey(`token:${token}`)
})

const recoveryCodeVerifyIpLimit = limiter.define('recovery-code-verify-ip', (ctx) => {
  return limiter.allowRequests(20).every('15 minutes').usingKey(ctx.request.ip())
})

router
  .post('/api/auth/recovery/code-verify', '#controllers/user_controller.verifyRecoveryCode')
  .use(recoveryCodeVerifyTokenLimit)
  .use(recoveryCodeVerifyIpLimit)
