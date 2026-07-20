import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/work_disability_period_expense_controller.store')
    router.get(
      '/:workDisabilityPeriodExpenseId',
      '#controllers/work_disability_period_expense_controller.show'
    )
    router.put(
      '/:workDisabilityPeriodExpenseId',
      '#controllers/work_disability_period_expense_controller.update'
    )
    router.delete(
      '/:workDisabilityPeriodExpenseId',
      '#controllers/work_disability_period_expense_controller.delete'
    )
  })
  .prefix('/api/work-disability-period-expenses')
  .use(middleware.auth())
  .use(middleware.businessScope())
