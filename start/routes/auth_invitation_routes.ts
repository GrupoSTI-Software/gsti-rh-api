import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'

const invitationVerifyTokenLimit = limiter.define('invitation-verify-token', (ctx) => {
  const token = String(ctx.params.token ?? 'unknown')
  return limiter.allowRequests(5).every('15 minutes').usingKey(`invitation-token:${token}`)
})

const invitationVerifyIpLimit = limiter.define('invitation-verify-ip', (ctx) => {
  return limiter.allowRequests(20).every('15 minutes').usingKey(ctx.request.ip())
})

const invitationSetPasswordTokenLimit = limiter.define('invitation-set-password-token', (ctx) => {
  const token = String(ctx.request.input('token') ?? 'unknown')
  return limiter
    .allowRequests(5)
    .every('15 minutes')
    .usingKey(`invitation-set-password-token:${token}`)
})

const invitationSetPasswordIpLimit = limiter.define('invitation-set-password-ip', (ctx) => {
  return limiter.allowRequests(20).every('15 minutes').usingKey(ctx.request.ip())
})

router
  .post(
    '/api/auth/invitation/verify/:token',
    '#controllers/auth_invitation_controller.verify'
  )
  .use(invitationVerifyTokenLimit)
  .use(invitationVerifyIpLimit)

router
  .post(
    '/api/auth/invitation/set-password',
    '#controllers/auth_invitation_controller.setPassword'
  )
  .use(invitationSetPasswordTokenLimit)
  .use(invitationSetPasswordIpLimit)
