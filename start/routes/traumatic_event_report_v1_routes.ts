import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Canal de captura del reporte de evento traumático desde la app del empleado
 * (NOM-035 §6.5). Mismo patrón que `assist_routes` (guard User `api` +
 * businessScope). El servidor resuelve el empleado del token y fija
 * origin='employee'; el catálogo de tipos se reutiliza en
 * `GET /api/traumatic-event-types` (no se crea variante /v1).
 */
router
  .group(() => {
    router.post(
      '/traumatic-event-reports',
      '#controllers/traumatic_event_report_controller.storeFromEmployee'
    )
  })
  .prefix('/api/v1')
  .use(middleware.auth())
  .use(middleware.businessScope())
