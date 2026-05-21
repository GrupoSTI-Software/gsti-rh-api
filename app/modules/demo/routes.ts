/* eslint-disable no-console -- trazas temporales modo demo */
import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'
import DemoAuditService from './services/demo_audit_service.js'

console.log('[DEMO-ROUTES-MODULE] routes.ts cargado')
const demoRateLimit = limiter.define('demo', (ctx) => {
  return limiter
    .allowRequests(3)
    .every('15 minutes')
    .usingKey(ctx.request.ip())
    .blockFor('1 hour')
    .limitExceeded(async (error) => {
      console.log(`[DEMO-RATE ${new Date().toISOString()}]`, 'límite excedido', {
        ip: ctx.request.ip(),
        message: error.message,
      })
      const audit = new DemoAuditService()
      await audit.log({
        ip:        ctx.request.ip(),
        userAgent: ctx.request.header('user-agent') ?? '',
        userId:    ctx.auth.user?.userId ?? null,
        resultado: 'rate_limit',
        motivo:    `Límite excedido: ${error.message}`,
      })
    })
})

router
  .group(() => {
    router.post('/', '#modules/demo/controllers/estructure_demo_controller.generateFactoryDemo')
  })
  .prefix('/api/generate-demo-v2')
  .use([
    demoRateLimit,
    async (ctx, next) => {
      console.log(`[DEMO-ROUTE ${new Date().toISOString()}]`, 'pasó rate limit + antes de auth()', {
        ip: ctx.request.ip(),
        hasAuthHeader: !!ctx.request.header('authorization'),
        authPrefix:    ctx.request.header('authorization')?.slice(0, 20) ?? null,
      })
      await next()
    },
    middleware.auth(),
    async (ctx, next) => {
      const u = ctx.auth.user
      console.log(`[DEMO-AUTH ${new Date().toISOString()}]`, 'middleware.auth() pasó — usuario disponible', {
        userId:   u?.userId ?? null,
        hasUser:  !!u,
      })
      await next()
    },
    async (ctx, next) => {
      console.log(`[DEMO-PRE-GUARD ${new Date().toISOString()}]`, 'siguiente: demo_guard_middleware', {
        path: ctx.request.url(),
      })
      await next()
    },
    () => import('./middleware/demo_guard_middleware.js'),
  ])
