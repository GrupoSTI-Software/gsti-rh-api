import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Evidencias adjuntas a los pendientes del expediente de salida
 * (USRH1786568279593). RBAC granular vía `EvidencesService.assertCanAccess`
 * en el controller: `read` lista y firma la descarga, `create` sube,
 * `delete` quita.
 */
router
  .group(() => {
    router.get(
      '/:offboardingId/items/:itemId/evidences',
      '#modules/employee-offboarding/evidences/evidences.controller.index'
    )
    router.post(
      '/:offboardingId/items/:itemId/evidences',
      '#modules/employee-offboarding/evidences/evidences.controller.store'
    )

    /* download-url se declara ANTES del DELETE /:evidenceId para que el
       segmento literal "download-url" no se confunda con un id numérico. */
    router.get(
      '/:offboardingId/items/:itemId/evidences/:evidenceId/download-url',
      '#modules/employee-offboarding/evidences/evidences.controller.downloadUrl'
    )
    router.delete(
      '/:offboardingId/items/:itemId/evidences/:evidenceId',
      '#modules/employee-offboarding/evidences/evidences.controller.destroy'
    )
  })
  .prefix('/api/employee-offboardings')
  .use(middleware.auth())
  .use(middleware.businessScope())
