import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/employee-lactation-periods',
      '#controllers/employee_lactation_periods_controller.index'
    )
    router.post(
      '/employee-lactation-periods',
      '#controllers/employee_lactation_periods_controller.store'
    )
    router.put(
      '/employee-lactation-periods/:id',
      '#controllers/employee_lactation_periods_controller.update'
    )
    router.delete(
      '/employee-lactation-periods/:id',
      '#controllers/employee_lactation_periods_controller.destroy'
    )
    router.post(
      '/employee-lactation-periods/:id/regenerate-shift-exceptions',
      '#controllers/employee_lactation_periods_controller.regenerateShiftExceptions'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
