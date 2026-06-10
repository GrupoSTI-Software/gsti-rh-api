import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .get('/api/v1/regulatory-coverage', '#modules/regulatory-coverage/regulatory_coverage.controller.index')
  .use(middleware.auth())

router
  .get('/api/v1/regulatory-coverage/summary', '#modules/regulatory-coverage/regulatory_coverage.controller.summary')
  .use(middleware.auth())

/**
 * Detalle de cobertura de una norma: cabecera + numerales hoja con features y módulos.
 * La ruta parametrizada va después de las rutas estáticas para evitar que
 * "summary" sea interpretado como un regulationId.
 */
router
  .get('/api/v1/regulatory-coverage/:regulationId', '#modules/regulatory-coverage/regulatory_coverage.controller.show')
  .use(middleware.auth())
