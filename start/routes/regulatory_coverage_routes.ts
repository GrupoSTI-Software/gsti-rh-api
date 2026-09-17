import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { REGULATORY_COVERAGE_PERMISSION_DECLARATIONS } from '#constants/regulatory_coverage_permission_declarations'

/**
 * Cobertura regulatoria: las tres lecturas exigen `regulatory-coverage:read`
 * (`regulatory_coverage_permission_declarations.ts`). Cada ruta monta su propio
 * `auth()` y el gate va después: antes correría sin usuario y negaría a todos.
 */

router
  .get(
    '/api/v1/regulatory-coverage',
    '#modules/regulatory-coverage/regulatory_coverage.controller.index'
  )
  .use(middleware.auth())
  .use(
    middleware.permissionGate(REGULATORY_COVERAGE_PERMISSION_DECLARATIONS.indexRegulatoryCoverage)
  )

router
  .get(
    '/api/v1/regulatory-coverage/summary',
    '#modules/regulatory-coverage/regulatory_coverage.controller.summary'
  )
  .use(middleware.auth())
  .use(
    middleware.permissionGate(REGULATORY_COVERAGE_PERMISSION_DECLARATIONS.regulatoryCoverageSummary)
  )

/**
 * Detalle de cobertura de una norma: cabecera + numerales hoja con features y módulos.
 * La ruta parametrizada va después de las rutas estáticas para evitar que
 * "summary" sea interpretado como un regulationId.
 */
router
  .get(
    '/api/v1/regulatory-coverage/:regulationId',
    '#modules/regulatory-coverage/regulatory_coverage.controller.show'
  )
  .use(middleware.auth())
  .use(
    middleware.permissionGate(REGULATORY_COVERAGE_PERMISSION_DECLARATIONS.showRegulatoryCoverage)
  )
