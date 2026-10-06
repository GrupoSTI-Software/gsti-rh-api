import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * USRH1790610965479 — lecturas de cobertura regulatoria: dato confidencial de
 * plataforma (roadmap interno), sin tenant. Solo usuarios de plataforma con
 * sesión del panel (origin = 'platform').
 *
 *   GET /api/platform/regulatory-coverage                   → lista de normas con su cobertura
 *   GET /api/platform/regulatory-coverage/summary           → resumen agregado y proyectado
 *   GET /api/platform/regulatory-coverage/:regulationId     → detalle de cobertura de una norma
 *
 * "/summary" va ANTES de "/:regulationId": si no, "summary" se toma como id (400).
 */
router
  .group(() => {
    router.get('/', '#modules/regulatory-coverage/regulatory_coverage.controller.index')
    router.get('/summary', '#modules/regulatory-coverage/regulatory_coverage.controller.summary')
    router.get('/:regulationId', '#modules/regulatory-coverage/regulatory_coverage.controller.show')
  })
  .prefix('/api/platform/regulatory-coverage')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
