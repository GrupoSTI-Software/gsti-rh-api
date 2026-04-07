import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/employee_psychometric_evaluation_controller.index')
    router.post('/', '#controllers/employee_psychometric_evaluation_controller.store')
    router.get(
      '/employee/:employeeId',
      '#controllers/employee_psychometric_evaluation_controller.getByEmployee'
    )
    router.get(
      '/tests-by-position/:positionId',
      '#controllers/employee_psychometric_evaluation_controller.getTestsByPosition'
    )
    router.get(
      '/:employeePsychometricEvaluationId',
      '#controllers/employee_psychometric_evaluation_controller.show'
    )
    router.put(
      '/:employeePsychometricEvaluationId',
      '#controllers/employee_psychometric_evaluation_controller.update'
    )
    router.delete(
      '/:employeePsychometricEvaluationId',
      '#controllers/employee_psychometric_evaluation_controller.delete'
    )
  })
  .prefix('/api/employee-psychometric-evaluations')
  .use(middleware.auth())
