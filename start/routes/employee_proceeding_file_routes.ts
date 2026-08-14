import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get(
      '/get-expired-and-expiring',
      '#controllers/employee_proceeding_file_controller.getExpiresAndExpiring'
    )
    router.get('/', '#controllers/employee_proceeding_file_controller.index')
    router
      .post('/', '#controllers/employee_proceeding_file_controller.store')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeProceedingFile)
      )
    router
      .put(
        '/:employeeProceedingFileId',
        '#controllers/employee_proceeding_file_controller.update'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeProceedingFile)
      )
    router
      .delete(
        '/:employeeProceedingFileId',
        '#controllers/employee_proceeding_file_controller.delete'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeProceedingFile)
      )
    router.get(
      '/:employeeProceedingFileId',
      '#controllers/employee_proceeding_file_controller.show'
    )
    router.get(
      '/:employeeProceedingFileId/download',
      '#controllers/employee_proceeding_file_controller.download'
    )
  })
  .prefix('/api/employees-proceeding-files')
  .use(middleware.auth())
  .use(middleware.businessScope())
