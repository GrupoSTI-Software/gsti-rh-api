import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Documentos del expediente de salida (USRH1787433503686). RBAC granular
 * vía `DocumentsService.assertCanAccess` en el controller: `read` lista y
 * firma la descarga, `create` emite. `download-url` se declara antes del
 * hueco reservado a `DELETE /:documentId` (no existe en toda la cadena).
 */
router
  .group(() => {
    router.get(
      '/:offboardingId/documents',
      '#modules/employee-offboarding/documents/documents.controller.index'
    )
    router.post(
      '/:offboardingId/documents',
      '#modules/employee-offboarding/documents/documents.controller.store'
    )
    router.get(
      '/:offboardingId/documents/:documentId/download-url',
      '#modules/employee-offboarding/documents/documents.controller.downloadUrl'
    )
  })
  .prefix('/api/employee-offboardings')
  .use(middleware.auth())
  .use(middleware.businessScope())
