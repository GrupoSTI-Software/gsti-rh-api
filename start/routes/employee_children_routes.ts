import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_children_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeChild))
    router
      .put('/:employeeChildrenId', '#controllers/employee_children_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeChild))
    router
      .delete('/:employeeChildrenId', '#controllers/employee_children_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeChild))
    router.get('/:employeeChildrenId', '#controllers/employee_children_controller.show')
  })
  .prefix('/api/employee-children')
  .use(middleware.auth())
  .use(middleware.businessScope())
