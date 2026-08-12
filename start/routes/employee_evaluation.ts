import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/', '#controllers/employee_evaluation_controller.index')
    router
      .post('/', '#controllers/employee_evaluation_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeEvaluation))
    router
      .put('/:employeeEvaluationId', '#controllers/employee_evaluation_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeEvaluation))
    router
      .delete('/:employeeEvaluationId', '#controllers/employee_evaluation_controller.destroy')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeEvaluation))
    router.get('/:employeeEvaluationId', '#controllers/employee_evaluation_controller.show')
    router.get(
      '/by-employee/:employeeId',
      '#controllers/employee_evaluation_controller.getByEmployee'
    )
    router
      .put(
        '/update-potential/:employeeEvaluationId',
        '#controllers/employee_evaluation_controller.updatePotential'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeEvaluationPotential
        )
      )
  })
  .prefix('/api/employee-evaluations')
  .use(middleware.auth())
  .use(middleware.businessScope())
