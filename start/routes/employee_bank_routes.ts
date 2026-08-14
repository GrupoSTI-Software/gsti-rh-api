import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_bank_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeBank))
    router
      .put('/:employeeBankId', '#controllers/employee_bank_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBank))
    router
      .delete('/:employeeBankId', '#controllers/employee_bank_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeBank))
    router.get('/:employeeBankId', '#controllers/employee_bank_controller.show')
  })
  .prefix('/api/employee-banks')
  .use(middleware.auth())
  .use(middleware.businessScope())
