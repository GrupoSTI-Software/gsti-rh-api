import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS } from '#constants/employees_download_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/work_disability_period_expense_controller.store')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createWorkDisabilityPeriodExpense
        )
      )
    /* download debe declararse ANTES del GET /:workDisabilityPeriodExpenseId; el
       matcher .where(...number()) evita que un segmento literal futuro se
       confunda con el ID (USRH1787434050259). */
    router
      .get(
        '/:workDisabilityPeriodExpenseId/download',
        '#controllers/work_disability_period_expense_controller.download'
      )
      .where('workDisabilityPeriodExpenseId', router.matchers.number())
      .use(
        middleware.permissionGate(
          EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.downloadWorkDisabilityFile
        )
      )
    router
      .get(
        '/:workDisabilityPeriodExpenseId',
        '#controllers/work_disability_period_expense_controller.show'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_READ_PERMISSION_DECLARATIONS.showWorkDisabilityPeriodExpense
        )
      )
    router
      .put(
        '/:workDisabilityPeriodExpenseId',
        '#controllers/work_disability_period_expense_controller.update'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateWorkDisabilityPeriodExpense
        )
      )
    router
      .delete(
        '/:workDisabilityPeriodExpenseId',
        '#controllers/work_disability_period_expense_controller.delete'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteWorkDisabilityPeriodExpense
        )
      )
  })
  .prefix('/api/work-disability-period-expenses')
  .use(middleware.auth())
  .use(middleware.businessScope())
