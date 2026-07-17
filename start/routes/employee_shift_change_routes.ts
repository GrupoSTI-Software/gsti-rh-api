/* eslint-disable prettier/prettier */
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/employee_shift_change_controller.store')
    router.delete('/:employeeShiftChangeId', '#controllers/employee_shift_change_controller.delete')
    router.get('/:employeeShiftChangeId', '#controllers/employee_shift_change_controller.show')
    router.get(
      '/by-employee/:employeeId',
      '#controllers/employee_shift_change_controller.getByEmployee'
    )
  })
  .use(middleware.auth())
  .use(middleware.businessScope())
  .prefix('/api/employee-shift-changes')
