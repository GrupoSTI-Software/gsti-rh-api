import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/repse/coverage-report', '#modules/repse-coverage-report/repse_coverage_report.controller.index')
    router.get(
      '/repse/coverage-report/export',
      '#modules/repse-coverage-report/repse_coverage_report.controller.export'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
