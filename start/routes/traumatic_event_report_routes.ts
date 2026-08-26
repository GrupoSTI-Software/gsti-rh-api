import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/traumatic-event-reports', '#controllers/traumatic_event_report_controller.index')
    router.post('/traumatic-event-reports', '#controllers/traumatic_event_report_controller.store')

    // Registro auditable NOM-035 §5.8.c — declarar ANTES de /:id para que
    // el segmento literal "registry" no sea confundido con un identificador.
    router.get(
      '/traumatic-event-reports/registry',
      '#controllers/traumatic_event_report_controller.registry'
    )
    router.get(
      '/traumatic-event-reports/registry/export',
      '#controllers/traumatic_event_report_controller.registryExport'
    )

    // Documento imprimible NOM-035 §6.5 — declarar ANTES de /:id para que
    // el segmento "printable-document" no sea confundido con un ID numérico.
    router.get(
      '/traumatic-event-reports/:reportId/printable-document',
      '#controllers/traumatic_event_report_controller.printableDocument'
    )

    router.get('/traumatic-event-reports/:id', '#controllers/traumatic_event_report_controller.show')
    router.put('/traumatic-event-reports/:id', '#controllers/traumatic_event_report_controller.update')
    router.delete(
      '/traumatic-event-reports/:id',
      '#controllers/traumatic_event_report_controller.destroy'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
  .use(middleware.sensitiveMaskEcho())
