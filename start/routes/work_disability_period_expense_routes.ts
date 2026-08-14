import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/work_disability_period_expense_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createWorkDisabilityPeriodExpense))
    router.get(
      '/:workDisabilityPeriodExpenseId',
      '#controllers/work_disability_period_expense_controller.show'
    )
    router
      .put(
        '/:workDisabilityPeriodExpenseId',
        '#controllers/work_disability_period_expense_controller.update'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateWorkDisabilityPeriodExpense))
    router
      .delete(
        '/:workDisabilityPeriodExpenseId',
        '#controllers/work_disability_period_expense_controller.delete'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteWorkDisabilityPeriodExpense))
  })
  .prefix('/api/work-disability-period-expenses')
  .use(middleware.auth())
  .use(middleware.businessScope())
