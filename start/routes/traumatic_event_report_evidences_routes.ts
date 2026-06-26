import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas de evidencias documentales adjuntas a un reporte de evento traumático.
 * Anidadas bajo /api/traumatic-event-reports/:reportId/evidences.
 *
 * Declarar ANTES de /:reportId en el fichero principal (aunque aquí se define
 * con su propio prefix completo, por lo que el orden no genera conflicto).
 *
 * Endpoints:
 *   GET    /api/traumatic-event-reports/:reportId/evidences
 *   POST   /api/traumatic-event-reports/:reportId/evidences
 *   GET    /api/traumatic-event-reports/:reportId/evidences/:evidenceId/download-url
 *   DELETE /api/traumatic-event-reports/:reportId/evidences/:evidenceId
 */
router
  .group(() => {
    router.get(
      '/traumatic-event-reports/:reportId/evidences',
      '#controllers/traumatic_event_report_evidences_controller.index'
    )
    router.post(
      '/traumatic-event-reports/:reportId/evidences',
      '#controllers/traumatic_event_report_evidences_controller.store'
    )

    /* download-url debe declararse ANTES del DELETE /:evidenceId para que el
       segmento literal "download-url" no sea confundido con un ID numérico. */
    router.get(
      '/traumatic-event-reports/:reportId/evidences/:evidenceId/download-url',
      '#controllers/traumatic_event_report_evidences_controller.downloadUrl'
    )
    router.delete(
      '/traumatic-event-reports/:reportId/evidences/:evidenceId',
      '#controllers/traumatic_event_report_evidences_controller.destroy'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
