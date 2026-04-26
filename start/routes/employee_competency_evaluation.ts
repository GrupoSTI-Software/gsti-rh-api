import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/employee_competency_evaluation_controller.index')
    router.post('/', '#controllers/employee_competency_evaluation_controller.store')
    router.put('/:employeeCompetencyEvaluationId', '#controllers/employee_competency_evaluation_controller.update')
    router.delete('/:employeeCompetencyEvaluationId', '#controllers/employee_competency_evaluation_controller.destroy')
    router.get('/:employeeCompetencyEvaluationId', '#controllers/employee_competency_evaluation_controller.show')
  })
  .prefix('/api/employee-competency-evaluations')
  .use(middleware.auth())
