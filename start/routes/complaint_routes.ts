import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'

/**
 * Envío de evidencias (regla 4, USRH1783115930049): 10 por usuario cada
 * minuto. Endpoint autenticado y sin reintentos automáticos de la app, así
 * que aquí sí corre como middleware — a diferencia de `/status`, que
 * penaliza solo fallos desde el controller (ver `complaint_controller.ts`).
 * Espejo de `employee-badge/badge.routes.ts` (bulk) y
 * `onboarding/demo_seed.routes.ts`.
 */
const complaintAttachmentsRateLimit = limiter.define('complaint-attachments', (ctx) => {
  const key = ctx.auth?.user?.userId ?? ctx.request.ip()
  return limiter.allowRequests(10).every('1 minute').usingKey(`user:${key}`)
})

router
  .group(() => {
    // Deprecada (USRH1783115930049): folio/passphrase en query string quedan en logs.
    router.get('/status', '#controllers/complaint_controller.consultStatus')
    // POST con credenciales en el body (USRH1783115930049): sustituto
    // recomendado del GET de arriba, que queda deprecated pero operativo.
    router.post('/status', '#controllers/complaint_controller.consultStatusFromBody')

    router
      .get('/attachments/:id/download-url', '#controllers/complaint_attachment_controller.downloadUrl')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .delete('/attachments/:id', '#controllers/complaint_attachment_controller.destroy')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .post('/', '#controllers/complaint_controller.store')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .get('/', '#controllers/complaint_controller.index')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .get('/report/export', '#controllers/complaint_controller.reportExport')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .get('/report', '#controllers/complaint_controller.report')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .get('/:complaintId/history', '#controllers/complaint_controller.history')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .patch('/:complaintId/status', '#controllers/complaint_controller.patchStatus')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .post('/:complaintId/reveal-identity', '#controllers/complaint_controller.revealIdentity')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .get('/:complaintId/reveal-history', '#controllers/complaint_controller.revealHistory')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .delete('/:complaintId', '#controllers/complaint_controller.destroy')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .get('/:complaintId', '#controllers/complaint_controller.show')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())

    router
      .post('/:folio/attachments', '#controllers/complaint_attachment_controller.store')
      .use(middleware.auth())
      .use(complaintAttachmentsRateLimit)

    router
      .get('/:complaintId/attachments', '#controllers/complaint_attachment_controller.index')
      .use(middleware.auth())
      .use(middleware.businessScopeOptional())
  })
  .prefix('/api/v1/complaints')
