import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'

/**
 * Límite de la carga (el endpoint caro del set: hasta 10 MB, subida y
 * relectura). Clave por usuario con respaldo por IP — nunca un cubo global
 * único. DECORATIVO: `config/limiter.ts` usa store `memory`, por nodo; no se
 * vende como control de abuso.
 */
const templateUploadRateLimit = limiter.define('offboarding-template-upload', (ctx) => {
  return limiter
    .allowRequests(10)
    .every('1 minute')
    .usingKey(ctx.auth.user?.userId ?? ctx.request.ip())
})

/**
 * Plantillas propias del documento de salida (USRH1788553841100). RBAC
 * granular vía `DocumentTemplatesService.assertCanAccess` en el controller:
 * `read` consulta y firma la descarga, `create` sube. Rutas literales antes
 * que paramétricas. `GET /fields` (catálogo de campos combinables) queda
 * RESERVADA para USRH1788579938623 entre `/` y `/:documentType/versions`: no
 * se declara aquí. No existe `DELETE` ni ruta que mute `status` (regla 5).
 */
router
  .group(() => {
    router.get(
      '/',
      '#modules/employee-offboarding/document-templates/document_templates.controller.index'
    )
    // GET /fields — reservada (USRH1788579938623)
    router.get(
      '/:documentType/versions',
      '#modules/employee-offboarding/document-templates/document_templates.controller.versions'
    )
    router
      .post(
        '/:documentType/versions',
        '#modules/employee-offboarding/document-templates/document_templates.controller.store'
      )
      .use(templateUploadRateLimit)
    router.get(
      '/:documentType/versions/:versionId/download-url',
      '#modules/employee-offboarding/document-templates/document_templates.controller.downloadUrl'
    )
  })
  .prefix('/api/employee-offboarding-document-templates')
  .use(middleware.auth())
  .use(middleware.businessScope())
