import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/', '#controllers/employee_address_controller.index')
    router
      .post('/', '#controllers/employee_address_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeAddress))
    router
      .put('/:employeeAddressId', '#controllers/employee_address_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeAddress))
    router
      .delete('/:employeeAddressId', '#controllers/employee_address_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeAddress))
    router.get('/:employeeAddressId', '#controllers/employee_address_controller.show')
  })
  .prefix('/api/employee-address')
  .use(middleware.auth())
  .use(middleware.businessScope())
