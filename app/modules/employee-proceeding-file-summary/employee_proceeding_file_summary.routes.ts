import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

/**
 * Resumen del expediente de un empleado. Mismo gate (`tab-expediente-read`) y
 * mismo scope de empresa que `GET /employees/:employeeId/proceeding-files`.
 */
router
  .group(() => {
    router
      .get(
        '/:employeeId/proceeding-file-summary',
        '#modules/employee-proceeding-file-summary/employee_proceeding_file_summary.controller.show'
      )
      .where('employeeId', router.matchers.number())
      .use(
        middleware.permissionGate(
          EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeProceedingFileSummary
        )
      )
  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
