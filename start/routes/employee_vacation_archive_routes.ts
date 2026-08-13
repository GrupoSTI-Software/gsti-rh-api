import router from '@adonisjs/core/services/router'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_vacation_archive_controller.store')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeVacationArchive
        )
      )
    router
      .get('/', '#controllers/employee_vacation_archive_controller.index')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployeeVacationArchives)
      )
    router
      .get('/:employeeVacationArchiveId', '#controllers/employee_vacation_archive_controller.show')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeVacationArchive)
      )
    router
      .delete('/:employeeVacationArchiveId', '#controllers/employee_vacation_archive_controller.destroy')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeVacationArchive
        )
      )

    router
      .post(
        '/:employeeVacationArchiveId/contents',
        '#controllers/employee_vacation_archive_content_controller.store'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeVacationArchiveContent
        )
      )
    router
      .get(
        '/:employeeVacationArchiveId/contents',
        '#controllers/employee_vacation_archive_content_controller.index'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexVacationArchiveContents)
      )
    router
      .get(
        '/:employeeVacationArchiveId/contents/:employeeVacationArchiveContentId',
        '#controllers/employee_vacation_archive_content_controller.show'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showVacationArchiveContent)
      )
    router
      .post(
        '/:employeeVacationArchiveId/contents/:employeeVacationArchiveContentId',
        '#controllers/employee_vacation_archive_content_controller.update'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeVacationArchiveContent
        )
      )
    router
      .delete(
        '/:employeeVacationArchiveId/contents/:employeeVacationArchiveContentId',
        '#controllers/employee_vacation_archive_content_controller.destroy'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeVacationArchiveContent
        )
      )
  })
  .use(middleware.auth())
  .use(middleware.businessScope())
  .prefix('/api/employee-vacation-archives')
