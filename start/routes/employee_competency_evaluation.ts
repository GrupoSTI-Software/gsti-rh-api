import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .get('/', '#controllers/employee_competency_evaluation_controller.index')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexCompetencyEvaluations)
      )
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
    router
      .get(
        '/:employeeCompetencyEvaluationId',
        '#controllers/employee_competency_evaluation_controller.show'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showCompetencyEvaluation)
      )
  })
  .prefix('/api/employee-competency-evaluations')
  .use(middleware.auth())
  .use(middleware.businessScope())
