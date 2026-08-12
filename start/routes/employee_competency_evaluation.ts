import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/', '#controllers/employee_competency_evaluation_controller.index')
    router
      .post('/', '#controllers/employee_competency_evaluation_controller.store')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeCompetencyEvaluation
        )
      )
    router
      .put(
        '/:employeeCompetencyEvaluationId',
        '#controllers/employee_competency_evaluation_controller.update'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeCompetencyEvaluation
        )
      )
    router
      .delete(
        '/:employeeCompetencyEvaluationId',
        '#controllers/employee_competency_evaluation_controller.destroy'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeCompetencyEvaluation
        )
      )
    router.get(
      '/:employeeCompetencyEvaluationId',
      '#controllers/employee_competency_evaluation_controller.show'
    )
  })
  .prefix('/api/employee-competency-evaluations')
  .use(middleware.auth())
  .use(middleware.businessScope())
