import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { REPSE_COVERAGE_REPORT_PERMISSION_DECLARATIONS } from '#constants/repse_coverage_report_permission_declarations'

router
  .group(() => {
    router
      .get(
        '/repse/coverage-report',
        '#modules/repse-coverage-report/repse_coverage_report.controller.index'
      )
      .use(
        middleware.permissionGate(REPSE_COVERAGE_REPORT_PERMISSION_DECLARATIONS.showCoverageReport)
      )
    router
      .get(
        '/repse/coverage-report/export',
        '#modules/repse-coverage-report/repse_coverage_report.controller.export'
      )
      .use(
        middleware.permissionGate(REPSE_COVERAGE_REPORT_PERMISSION_DECLARATIONS.exportCoverageReport)
      )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
