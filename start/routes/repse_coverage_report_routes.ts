import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const COVERAGE_REPORT_PERMISSION = {
  module: 'compliance-contratos',
  action: 'read',
  bypass: 'expanded',
} as const

router
  .group(() => {
    router
      .get(
        '/repse/coverage-report',
        '#modules/repse-coverage-report/repse_coverage_report.controller.index'
      )
      .use(middleware.permissionGate(COVERAGE_REPORT_PERMISSION))
    router
      .get(
        '/repse/coverage-report/export',
        '#modules/repse-coverage-report/repse_coverage_report.controller.export'
      )
      .use(middleware.permissionGate(COVERAGE_REPORT_PERMISSION))
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
