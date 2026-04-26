import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/employee_assessment_controller.index')
    router.post('/', '#controllers/employee_assessment_controller.store')
    router.get(
      '/employee/:employeeId',
      '#controllers/employee_assessment_controller.getByEmployee'
    )
    router.get(
      '/tests-by-position/:positionId',
      '#controllers/employee_assessment_controller.getTemplatesByPosition'
    )
    router.get(
      '/:employeeAssessmentId',
      '#controllers/employee_assessment_controller.show'
    )
    router.put(
      '/:employeeAssessmentId',
      '#controllers/employee_assessment_controller.update'
    )
    router.delete(
      '/:employeeAssessmentId',
      '#controllers/employee_assessment_controller.delete'
    )
  })
  .prefix('/api/employee-assessments')
  .use(middleware.auth())
