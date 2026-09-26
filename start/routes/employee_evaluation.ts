import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .get('/', '#controllers/employee_evaluation_controller.index')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployeeEvaluations)
      )
    router
      .post('/', '#controllers/employee_evaluation_controller.store')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeEvaluation)
      )
    router
      .put('/:employeeEvaluationId', '#controllers/employee_evaluation_controller.update')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeEvaluation)
      )
    router
      .delete('/:employeeEvaluationId', '#controllers/employee_evaluation_controller.destroy')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeEvaluation)
      )
    router
      .get('/:employeeEvaluationId', '#controllers/employee_evaluation_controller.show')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeEvaluation))
    router
      .get('/by-employee/:employeeId', '#controllers/employee_evaluation_controller.getByEmployee')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEvaluationsByEmployee)
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
