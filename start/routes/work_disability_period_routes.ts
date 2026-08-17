import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/work_disability_period_controller.store')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createWorkDisabilityPeriod
        )
      )
    router
      .get('/:workDisabilityPeriodId', '#controllers/work_disability_period_controller.show')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showWorkDisabilityPeriod)
      )
    router
      .put('/:workDisabilityPeriodId', '#controllers/work_disability_period_controller.update')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateWorkDisabilityPeriod
        )
      )
    router
      .delete('/:workDisabilityPeriodId', '#controllers/work_disability_period_controller.delete')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteWorkDisabilityPeriod
        )
      )
  })
  .prefix('/api/work-disability-periods')
  .use(middleware.auth())
  .use(middleware.businessScope())
