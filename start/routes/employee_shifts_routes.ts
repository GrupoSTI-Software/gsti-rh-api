import router from '@adonisjs/core/services/router'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/employee_shifts', '#controllers/employee_shifts_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeShift))
    router
      .get('/employee_shifts', '#controllers/employee_shifts_controller.index')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployeeShifts))
    router
      .get('/employee_shifts/:id', '#controllers/employee_shifts_controller.show')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeShift))
    router
      .put('/employee_shifts/:id', '#controllers/employee_shifts_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeShift))
    router
      .delete('/employee_shifts/:id', '#controllers/employee_shifts_controller.destroy')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeShift))
    router
      .get(
        '/employee-shifts-employee/:employeeId',
        '#controllers/employee_shifts_controller.getByEmployee'
      )
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getShiftsByEmployee))
    router
      .get(
        '/employee-shifts-active-shift-employee/:employeeId',
        '#controllers/employee_shifts_controller.getShiftActiveByEmployee'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getActiveShiftByEmployee)
      )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
