import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .get('/api/v1/regulatory-coverage', '#modules/regulatory-coverage/regulatory_coverage.controller.index')
  .use(middleware.auth())

router
  .get('/api/v1/regulatory-coverage/summary', '#modules/regulatory-coverage/regulatory_coverage.controller.summary')
  .use(middleware.auth())
