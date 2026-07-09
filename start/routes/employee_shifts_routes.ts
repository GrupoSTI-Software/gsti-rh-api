import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/employee_shifts', '#controllers/employee_shifts_controller.store')
    router.get('/employee_shifts', '#controllers/employee_shifts_controller.index')
    router.get('/employee_shifts/:id', '#controllers/employee_shifts_controller.show')
    router.put('/employee_shifts/:id', '#controllers/employee_shifts_controller.update')
    router.delete('/employee_shifts/:id', '#controllers/employee_shifts_controller.destroy')
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
