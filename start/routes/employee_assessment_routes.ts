import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .get('/', '#controllers/employee_assessment_controller.index')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployeeAssessments)
      )
    router
      .post('/', '#controllers/employee_assessment_controller.store')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeAssessment)
      )
    router
      .get('/employee/:employeeId', '#controllers/employee_assessment_controller.getByEmployee')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.getAssessmentsByEmployee)
      )
    router.get(
      '/tests-by-position/:positionId',
      '#controllers/employee_assessment_controller.getTemplatesByPosition'
    )
    router
      .get('/:employeeAssessmentId', '#controllers/employee_assessment_controller.show')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeAssessment))
    router
      .put('/:employeeAssessmentId', '#controllers/employee_assessment_controller.update')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeAssessment)
      )
    router
      .delete('/:employeeAssessmentId', '#controllers/employee_assessment_controller.delete')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeAssessment)
      )
  })
  .prefix('/api/employee-assessments')
  .use(middleware.auth())
  .use(middleware.businessScope())
