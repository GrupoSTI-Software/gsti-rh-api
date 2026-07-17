import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas del slice `consent/physical` (USRH1784146205513): registrar el consentimiento
 * biométrico firmado en papel, su estado y la descarga del escaneo, anidadas bajo el
 * recurso empleado.
 *
 * NUNCA se cuelgan del group global `/api/consent` (`acceptance.routes.ts`,
 * `evidence.routes.ts`): esas rutas son de plataforma con solo `middleware.auth()`
 * (consentimiento personal / evidencia global). Este slice opera sobre UN empleado de
 * UN tenant → grupo propio con `auth + businessScope` (H8, espejo de
 * `employee_lactation_periods_routes.ts`).
 */
router
  .group(() => {
    router.post(
      '/employees/:employeeId/consents/physical',
      '#modules/consent/physical/physical_consent.controller.store'
    )
    router.get(
      '/employees/:employeeId/consents/status',
      '#modules/consent/physical/physical_consent.controller.status'
    )
    router.get(
      '/employees/:employeeId/consents/:userConsentId/evidence-download-url',
      '#modules/consent/physical/physical_consent.controller.downloadUrl'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
