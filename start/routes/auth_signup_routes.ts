import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'

const signupRateLimit = limiter.define('signup', (ctx) => {
  return limiter
    .allowRequests(5)
    .every('1 minute')
    .usingKey(ctx.request.ip())
})

router
  .group(() => {
    router.post('/start', '#controllers/auth_signup_controller.start')
    router.post('/verify-otp', '#controllers/auth_signup_controller.verifyOtp')
    router.post('/complete', '#controllers/auth_signup_controller.completeSignup')
  })
  .prefix('/api/auth/signup')
  .use(signupRateLimit)
