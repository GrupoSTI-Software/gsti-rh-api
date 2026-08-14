import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .get('/', '#controllers/employee_kpi_evaluation_controller.index')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexKpiEvaluations))
    router
      .post('/', '#controllers/employee_kpi_evaluation_controller.store')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeKpiEvaluation
        )
      )
    router
      .put('/:employeeKpiEvaluationId', '#controllers/employee_kpi_evaluation_controller.update')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeKpiEvaluation
        )
      )
    router
      .delete(
        '/:employeeKpiEvaluationId',
        '#controllers/employee_kpi_evaluation_controller.destroy'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeKpiEvaluation
        )
      )
    router
      .get('/:employeeKpiEvaluationId', '#controllers/employee_kpi_evaluation_controller.show')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showKpiEvaluation))
  })
  .prefix('/api/employee-kpi-evaluations')
  .use(middleware.auth())
  .use(middleware.businessScope())
