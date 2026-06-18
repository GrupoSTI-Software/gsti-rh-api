import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'

const magicLinkRequestRateLimit = limiter.define('magic-link-request', (ctx) => {
  return limiter.allowRequests(5).every('1 minute').usingKey(ctx.request.ip())
})

const magicLinkVerifyRateLimit = limiter.define('magic-link-verify', (ctx) => {
  return limiter.allowRequests(10).every('1 minute').usingKey(ctx.request.ip())
})

router
  .group(() => {
    router
      .post('/request', '#controllers/magic_link_controller.request')
      .use(magicLinkRequestRateLimit)
    router
      .post('/verify', '#controllers/magic_link_controller.verify')
      .use(magicLinkVerifyRateLimit)
  })
  .prefix('/api/auth/magic-link')
