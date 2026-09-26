import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_record_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeRecord))
    router
      .put('/:employeeRecordId', '#controllers/employee_record_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeRecord))
    router
      .delete('/:employeeRecordId', '#controllers/employee_record_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeRecord))
    router
      .get('/:employeeRecordId', '#controllers/employee_record_controller.show')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeRecord))
  })
  .prefix('/api/employee-records')
  .use(middleware.auth())
  .use(middleware.businessScope())
