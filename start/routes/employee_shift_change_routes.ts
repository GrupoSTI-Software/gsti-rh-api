/* eslint-disable prettier/prettier */
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_shift_change_controller.store')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeShiftChange)
      )
    router
      .delete('/:employeeShiftChangeId', '#controllers/employee_shift_change_controller.delete')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeShiftChange)
      )
    router.get('/:employeeShiftChangeId', '#controllers/employee_shift_change_controller.show')
    router.get(
      '/by-employee/:employeeId',
      '#controllers/employee_shift_change_controller.getByEmployee'
    )
  })
  .use(middleware.auth())
  .use(middleware.businessScope())
  .prefix('/api/employee-shift-changes')
