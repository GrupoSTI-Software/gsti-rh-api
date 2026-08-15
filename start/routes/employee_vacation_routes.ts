import router from '@adonisjs/core/services/router'
import { EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS } from '#constants/employees_download_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/get-excel', '#controllers/employee_vacation_controller.getExcel')
      .use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getVacationsExcel))
    router.get('/get-vacations-used-excel', '#controllers/employee_vacation_controller.getVacationsUsedExcel')
      .use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getVacationsUsedExcel))
    router.get('/get-vacations-summary-excel', '#controllers/employee_vacation_controller.getVacationsSummaryExcel')
      .use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getVacationsSummaryExcel))
    router.get(
      '/get-vacation-import-template',
      '#controllers/employee_vacation_controller.getVacationImportTemplate'
    )
      .use(middleware.permissionGate(EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getVacationImportTemplate))
    router
      .post(
        '/import-vacation-excel',
        '#controllers/employee_vacation_controller.importVacationExcel'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.importVacationExcel))
  })
  .prefix('/api/employees-vacations')
  .use(middleware.auth())
  .use(middleware.businessScope())
