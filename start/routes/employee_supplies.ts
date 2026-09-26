import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/employee-supplies', '#controllers/employee_supplies_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeSupply))
    router.get('/employee-supplies', '#controllers/employee_supplies_controller.index')
    router.get('/employee-supplies/:id', '#controllers/employee_supplies_controller.show')
    router
      .put('/employee-supplies/:id', '#controllers/employee_supplies_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeSupply))
    router
      .delete('/employee-supplies/:id', '#controllers/employee_supplies_controller.destroy')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeSupply))
    router
      .post('/employee-supplies/:id/retire', '#controllers/employee_supplies_controller.retire')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.retireEmployeeSupply))
    router.get('/employee-supplies/:id/with-relations', '#controllers/employee_supplies_controller.getWithRelations')
    router.get('/employee-supplies/by-employee/:employeeId', '#controllers/employee_supplies_controller.getByEmployee')
    router.get('/employee-supplies/active-by-employee/:employeeId', '#controllers/employee_supplies_controller.getActiveByEmployee')
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
