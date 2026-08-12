import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/employee_shifts', '#controllers/employee_shifts_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeShift))
    router.get('/employee_shifts', '#controllers/employee_shifts_controller.index')
    router.get('/employee_shifts/:id', '#controllers/employee_shifts_controller.show')
    router
      .put('/employee_shifts/:id', '#controllers/employee_shifts_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeShift))
    router
      .delete('/employee_shifts/:id', '#controllers/employee_shifts_controller.destroy')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeShift))
    router.get(
      '/employee-shifts-employee/:employeeId',
      '#controllers/employee_shifts_controller.getByEmployee'
    )
    router.get(
      '/employee-shifts-active-shift-employee/:employeeId',
      '#controllers/employee_shifts_controller.getShiftActiveByEmployee'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
