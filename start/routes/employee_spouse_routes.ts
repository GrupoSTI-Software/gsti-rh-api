import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_spouse_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeSpouse))
    router
      .put('/:employeeSpouseId', '#controllers/employee_spouse_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeSpouse))
    router
      .delete('/:employeeSpouseId', '#controllers/employee_spouse_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeSpouse))
    router.get('/:employeeSpouseId', '#controllers/employee_spouse_controller.show')
  })
  .prefix('/api/employee-spouses')
  .use(middleware.auth())
  .use(middleware.businessScope())
