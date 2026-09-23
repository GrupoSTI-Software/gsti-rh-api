import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { TRAUMATIC_EVENT_REPORTS_REGISTRY_PERMISSION_DECLARATIONS } from '#constants/traumatic_event_reports_registry_permission_declarations'

router
  .group(() => {
    router.get('/traumatic-event-reports', '#controllers/traumatic_event_report_controller.index')
    router.post('/traumatic-event-reports', '#controllers/traumatic_event_report_controller.store')

    // Registro auditable NOM-035 §5.8.c — declarar ANTES de /:id para que
    // el segmento literal "registry" no sea confundido con un identificador.
    // Exigen el módulo del registro, no el de reportes: es el que protege la
    // pantalla del backoffice. El resto de este grupo lo verifica su controller.
    router
      .get(
        '/traumatic-event-reports/registry',
        '#controllers/traumatic_event_report_controller.registry'
      )
      .use(
        middleware.permissionGate(TRAUMATIC_EVENT_REPORTS_REGISTRY_PERMISSION_DECLARATIONS.registry)
      )
    router
      .get(
        '/traumatic-event-reports/registry/export',
        '#controllers/traumatic_event_report_controller.registryExport'
      )
      .use(
        middleware.permissionGate(
          TRAUMATIC_EVENT_REPORTS_REGISTRY_PERMISSION_DECLARATIONS.registryExport
        )
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
