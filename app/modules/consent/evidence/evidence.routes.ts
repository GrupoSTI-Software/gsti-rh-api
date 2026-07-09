import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas de evidencia de aceptaciones (USRH1783368377327).
 *
 * GET /api/consent/evidence         — consulta paginada, filtrable.
 * GET /api/consent/evidence/export  — export a Excel de lo consultado.
 *
 * Solo `middleware.auth()`: la reserva real es por rol (root) vía
 * `assertConsentEvidenceAccess` dentro del controller, no por unidad de negocio —
 * la evidencia es de plataforma, global. NO usa `middleware.businessScope()`.
 */
router
  .group(() => {
    router.get('/evidence', '#modules/consent/evidence/evidence.controller.index')
    router.get('/evidence/export', '#modules/consent/evidence/evidence.controller.export')
  })
  .prefix('/api/consent')
  .use(middleware.auth())
