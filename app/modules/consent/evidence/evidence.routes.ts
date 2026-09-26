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
    // Descarga del escaneo de un asiento físico (USRH1784146205513). Va DESPUÉS de
    // `/evidence/export` por claridad visual; no hay colisión real de rutas (segmento
    // literal `export` vs. parámetro numérico `userConsentId`).
    router.get(
      '/evidence/:userConsentId/download-url',
      '#modules/consent/evidence/evidence.controller.downloadUrl'
    )
  })
  .prefix('/api/consent')
  .use(middleware.auth())
